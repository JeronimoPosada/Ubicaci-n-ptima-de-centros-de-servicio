/* ============================================================================
 *  mapengine.js — Motor de mapa de teselas (slippy map) sobre <canvas>
 *
 *  Implementación propia, sin librerías de terceros. Resuelve:
 *    · proyección Web Mercator y zoom continuo (las teselas del nivel entero
 *      más cercano se escalan, igual que en un motor comercial),
 *    · caché de teselas en memoria con reutilización del nivel padre mientras
 *      la tesela pedida todavía no llega (evita el parpadeo en blanco),
 *    · desplazamiento, zoom con rueda anclado al cursor y gesto de pinza,
 *    · un pipeline de capas: cada capa es una función de dibujo que recibe el
 *      contexto 2D y un objeto de vista con los conversores de coordenadas.
 *
 *  Toda capa dibuja en coordenadas de pantalla usando view.proj(lat, lon) o
 *  view.projKm(x, y); así la optimización nunca necesita saber de píxeles.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const TILE = 256;

  /*
   * Proveedores de teselas. Se usan servicios abiertos que no exigen clave:
   * OpenStreetMap para el callejero, OpenTopoMap para el relieve y la capa de
   * ortoimágenes de Esri. El estilo oscuro no es un proveedor distinto, sino
   * las mismas teselas de OSM pasadas por un filtro de inversión — la técnica
   * habitual para obtener un mapa nocturno sin depender de un servicio de pago.
   */
  const ESTILOS = {
    oscuro: {
      nombre: 'Oscuro',
      url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      attr: '© OpenStreetMap',
      fondo: '#0b0f14',
      filtro: 'invert(1) hue-rotate(185deg) brightness(.92) contrast(.86) saturate(.5)'
    },
    calles: {
      nombre: 'Calles',
      url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      attr: '© OpenStreetMap',
      fondo: '#dfe3e6',
      filtro: 'brightness(.92) saturate(.85)'
    },
    relieve: {
      nombre: 'Relieve',
      url: (z, x, y) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
      attr: '© OpenTopoMap · © OpenStreetMap',
      fondo: '#d8e0d4',
      filtro: 'brightness(.88) saturate(.9)'
    },
    satelite: {
      nombre: 'Satélite',
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      attr: 'Imágenes © Esri, Maxar, Earthstar Geographics',
      fondo: '#10161c',
      filtro: 'brightness(.78) saturate(.9)'
    },
    vectorial: {
      nombre: 'Sin conexión',
      url: null,                       // cartografía propia: funciona sin red
      attr: 'Cartografía vectorial propia',
      fondo: '#070b10',
      filtro: null
    }
  };

  class MapEngine {
    constructor(canvas, opciones) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.lat = opciones.lat;
      this.lon = opciones.lon;
      this.zoom = opciones.zoom;
      this.minZoom = opciones.minZoom || 9;
      this.maxZoom = opciones.maxZoom || 17;
      this.estilo = opciones.estilo || 'oscuro';

      this.capas = [];                 // { nombre, visible, dibujar(ctx, view) }
      this.cache = new Map();          // clave "z/x/y" -> HTMLImageElement
      this.pendientes = new Set();
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.retina = this.dpr > 1.2 ? '@2x' : '';
      this.necesitaRedibujo = true;
      this.enArrastre = false;
      this.manejadores = { down: [], move: [], up: [], hover: [] };
      this.animaciones = [];

      this._instalarEventos();
      this._observarTamano();
      this._bucle();
    }

    /* ------------------------------------------------------------------ */
    /*  Vista: conversores de coordenadas                                  */
    /* ------------------------------------------------------------------ */

    get ancho() { return this.canvas.clientWidth; }
    get alto() { return this.canvas.clientHeight; }

    /** Escala en píxeles de pantalla por unidad de "world pixel" del zoom base. */
    _escala() { return Math.pow(2, this.zoom - Math.round(this.zoom)); }
    _zBase() { return Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(this.zoom))); }

    /** Objeto inmutable que se pasa a las capas en cada frame. */
    vista() {
      const z = this.zoom;
      const cx = Geo.lonToWorldX(this.lon, z);
      const cy = Geo.latToWorldY(this.lat, z);
      const w2 = this.ancho / 2, h2 = this.alto / 2;

      const proj = (lat, lon) => ({
        x: Geo.lonToWorldX(lon, z) - cx + w2,
        y: Geo.latToWorldY(lat, z) - cy + h2
      });
      const projKm = (x, y) => {
        const g = Geo.toGeo(x, y);
        return proj(g.lat, g.lon);
      };
      const inv = (px, py) => ({
        lat: Geo.worldYToLat(py - h2 + cy, z),
        lon: Geo.worldXToLon(px - w2 + cx, z)
      });
      const invKm = (px, py) => {
        const g = inv(px, py);
        return Geo.toLocal(g.lat, g.lon);
      };
      // Escala lineal km -> px, válida localmente (el valle abarca < 0.5° de latitud).
      const pxPorKm = (() => {
        const a = projKm(0, 0), b = projKm(1, 0);
        return Math.hypot(b.x - a.x, b.y - a.y);
      })();

      return { proj, projKm, inv, invKm, pxPorKm, zoom: z, ancho: this.ancho, alto: this.alto };
    }

    /* ------------------------------------------------------------------ */
    /*  Capas                                                              */
    /* ------------------------------------------------------------------ */

    agregarCapa(nombre, dibujar, visible = true) {
      this.capas.push({ nombre, dibujar, visible });
      this.invalidar();
      return this;
    }

    capa(nombre) { return this.capas.find(c => c.nombre === nombre); }

    alternarCapa(nombre, visible) {
      const c = this.capa(nombre);
      if (c) { c.visible = visible; this.invalidar(); }
    }

    invalidar() { this.necesitaRedibujo = true; }

    /* ------------------------------------------------------------------ */
    /*  Navegación                                                         */
    /* ------------------------------------------------------------------ */

    irA(lat, lon, zoom, animado = true) {
      if (!animado) {
        this.lat = lat; this.lon = lon;
        if (zoom != null) this.zoom = zoom;
        return this.invalidar();
      }
      const t0 = performance.now(), dur = 600;
      const lat0 = this.lat, lon0 = this.lon, z0 = this.zoom;
      const z1 = zoom != null ? zoom : z0;
      this.animaciones.push((t) => {
        const u = Math.min(1, (t - t0) / dur);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // easeInOutCubic
        this.lat = lat0 + (lat - lat0) * e;
        this.lon = lon0 + (lon - lon0) * e;
        this.zoom = z0 + (z1 - z0) * e;
        return u < 1;
      });
      this.invalidar();
    }

    /** Encuadra una lista de {lat, lon} dejando un margen en píxeles. */
    encuadrar(puntos, margen = 70, animado = true) {
      if (!puntos.length) return;
      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      for (const p of puntos) {
        minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
      }
      let z = this.maxZoom;
      for (; z > this.minZoom; z--) {
        const w = Geo.lonToWorldX(maxLon, z) - Geo.lonToWorldX(minLon, z);
        const h = Geo.latToWorldY(minLat, z) - Geo.latToWorldY(maxLat, z);
        if (w <= this.ancho - 2 * margen && h <= this.alto - 2 * margen) break;
      }
      this.irA((minLat + maxLat) / 2, (minLon + maxLon) / 2, z, animado);
    }

    cambiarEstilo(clave) {
      if (!ESTILOS[clave]) return;
      this.estilo = clave;
      this.invalidar();
    }

    atribucion() { return ESTILOS[this.estilo].attr; }

    /* ------------------------------------------------------------------ */
    /*  Interacción: las capas se suscriben a eventos en coordenadas útiles */
    /* ------------------------------------------------------------------ */

    on(evento, fn) { this.manejadores[evento].push(fn); return this; }

    _puntero(ev) {
      const r = this.canvas.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      const v = this.vista();
      return Object.assign({ px, py, shift: ev.shiftKey }, v.inv(px, py), { km: v.invKm(px, py) });
    }

    _emitir(evento, ev) {
      const p = this._puntero(ev);
      for (const fn of this.manejadores[evento]) {
        if (fn(p, ev) === true) return true;   // capa consumió el evento
      }
      return false;
    }

    _instalarEventos() {
      const c = this.canvas;
      let arrastrando = false, ultimo = null, consumido = false;

      c.addEventListener('mousedown', (ev) => {
        consumido = this._emitir('down', ev);
        if (!consumido) { arrastrando = true; ultimo = { x: ev.clientX, y: ev.clientY }; }
        c.style.cursor = consumido ? 'grabbing' : 'grabbing';
      });

      global.addEventListener('mousemove', (ev) => {
        if (consumido) { this._emitir('move', ev); return; }
        if (arrastrando) {
          const dx = ev.clientX - ultimo.x, dy = ev.clientY - ultimo.y;
          ultimo = { x: ev.clientX, y: ev.clientY };
          this._desplazar(dx, dy);
        } else if (ev.target === c) {
          this._emitir('hover', ev);
        }
      });

      global.addEventListener('mouseup', (ev) => {
        if (consumido) this._emitir('up', ev);
        arrastrando = false; consumido = false;
        c.style.cursor = 'grab';
      });

      c.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const delta = -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0022);
        this._zoomEn(ev, this.zoom + delta * 3);
      }, { passive: false });

      c.addEventListener('dblclick', (ev) => { ev.preventDefault(); this._zoomEn(ev, this.zoom + 1); });

      /* --- Táctil: un dedo desplaza, dos dedos hacen zoom de pinza --- */
      let tPrev = null;
      c.addEventListener('touchstart', (ev) => { tPrev = this._touchInfo(ev); }, { passive: true });
      c.addEventListener('touchmove', (ev) => {
        ev.preventDefault();
        const t = this._touchInfo(ev);
        if (!tPrev || t.n !== tPrev.n) { tPrev = t; return; }
        this._desplazar(t.cx - tPrev.cx, t.cy - tPrev.cy);
        if (t.n === 2 && tPrev.d > 0) this.zoom = this._limitarZoom(this.zoom + Math.log2(t.d / tPrev.d));
        tPrev = t; this.invalidar();
      }, { passive: false });
      c.addEventListener('touchend', () => { tPrev = null; }, { passive: true });
    }

    _touchInfo(ev) {
      const ts = ev.touches, r = this.canvas.getBoundingClientRect();
      if (!ts.length) return null;
      if (ts.length === 1) return { n: 1, cx: ts[0].clientX - r.left, cy: ts[0].clientY - r.top, d: 0 };
      const a = ts[0], b = ts[1];
      return {
        n: 2,
        cx: (a.clientX + b.clientX) / 2 - r.left,
        cy: (a.clientY + b.clientY) / 2 - r.top,
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      };
    }

    _limitarZoom(z) { return Math.max(this.minZoom, Math.min(this.maxZoom, z)); }

    _desplazar(dx, dy) {
      const z = this.zoom;
      const cx = Geo.lonToWorldX(this.lon, z) - dx;
      const cy = Geo.latToWorldY(this.lat, z) - dy;
      this.lon = Geo.worldXToLon(cx, z);
      this.lat = Geo.worldYToLat(cy, z);
      this.invalidar();
    }

    /** Zoom manteniendo fijo el punto geográfico bajo el cursor. */
    _zoomEn(ev, nuevoZoom) {
      const r = this.canvas.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      const antes = this.vista().inv(px, py);
      this.zoom = this._limitarZoom(nuevoZoom);
      const despues = this.vista().inv(px, py);
      this.lat += antes.lat - despues.lat;
      this.lon += antes.lon - despues.lon;
      this.invalidar();
    }

    /* ------------------------------------------------------------------ */
    /*  Teselas                                                            */
    /* ------------------------------------------------------------------ */

    _tesela(z, x, y) {
      const clave = `${this.estilo}/${z}/${x}/${y}`;
      if (this.cache.has(clave)) return this.cache.get(clave);
      if (this.pendientes.has(clave)) return null;

      const def = ESTILOS[this.estilo];
      if (!def.url) return null;
      const n = 1 << z;
      if (y < 0 || y >= n) return null;
      const xx = ((x % n) + n) % n;

      this.pendientes.add(clave);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { this.cache.set(clave, img); this.pendientes.delete(clave); this.invalidar(); };
      img.onerror = () => { this.pendientes.delete(clave); };
      img.src = def.url(z, xx, y, this.retina);
      return null;
    }

    _dibujarTeselas() {
      const ctx = this.ctx, def = ESTILOS[this.estilo];
      ctx.fillStyle = def.fondo;
      ctx.fillRect(0, 0, this.ancho, this.alto);
      if (!def.url) return;

      const z = this._zBase();
      const esc = Math.pow(2, this.zoom - z);
      const cx = Geo.lonToWorldX(this.lon, z), cy = Geo.latToWorldY(this.lat, z);
      const w2 = this.ancho / 2, h2 = this.alto / 2;

      // Rango de teselas visible, con un anillo extra para precargar.
      const x0 = Math.floor((cx - w2 / esc) / TILE) - 1;
      const x1 = Math.floor((cx + w2 / esc) / TILE) + 1;
      const y0 = Math.floor((cy - h2 / esc) / TILE) - 1;
      const y1 = Math.floor((cy + h2 / esc) / TILE) + 1;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (def.filtro) ctx.filter = def.filtro;

      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const sx = (tx * TILE - cx) * esc + w2;
          const sy = (ty * TILE - cy) * esc + h2;
          const s = TILE * esc + 0.5;   // +0.5 evita costuras por redondeo
          const img = this._tesela(z, tx, ty);
          if (img) { ctx.drawImage(img, sx, sy, s, s); continue; }
          // Sustituto: recorte de la tesela padre ya cacheada (sin parpadeo).
          this._dibujarPadre(z, tx, ty, sx, sy, s);
        }
      }
      ctx.restore();
    }

    _dibujarPadre(z, tx, ty, sx, sy, s) {
      for (let up = 1; up <= 4 && z - up >= this.minZoom - 2; up++) {
        const pz = z - up, f = 1 << up;
        const px = Math.floor(tx / f), py = Math.floor(ty / f);
        const img = this.cache.get(`${this.estilo}/${pz}/${px}/${py}`);
        if (!img) continue;
        const sub = TILE / f;
        this.ctx.drawImage(img, (tx - px * f) * sub, (ty - py * f) * sub, sub, sub, sx, sy, s, s);
        return;
      }
    }

    /* ------------------------------------------------------------------ */
    /*  Bucle de render                                                    */
    /* ------------------------------------------------------------------ */

    _observarTamano() {
      const ajustar = () => {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.invalidar();
      };
      new ResizeObserver(ajustar).observe(this.canvas);
      ajustar();
    }

    _bucle() {
      const frame = (t) => {
        if (this.animaciones.length) {
          this.animaciones = this.animaciones.filter(a => a(t));
          this.necesitaRedibujo = true;
        }
        if (this.necesitaRedibujo) {
          this.necesitaRedibujo = false;
          this._render();
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    _render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.ancho, this.alto);
      this._dibujarTeselas();
      const v = this.vista();
      for (const capa of this.capas) {
        if (!capa.visible) continue;
        ctx.save();
        try { capa.dibujar(ctx, v); } catch (e) { console.error('Capa', capa.nombre, e); }
        ctx.restore();
      }
    }
  }

  global.MapEngine = MapEngine;
  global.MapEngine.ESTILOS = ESTILOS;
})(window);
