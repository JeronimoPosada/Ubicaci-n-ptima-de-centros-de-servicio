/* ============================================================================
 *  geo.js — Geodesia y proyecciones
 *  Proyecto de Aula · Optimización · USB Medellín
 *
 *  Dos proyecciones conviven en la aplicación:
 *
 *  1) Web Mercator (EPSG:3857)  -> render del mapa de teselas (slippy map).
 *  2) Plano local ENU en km     -> dominio donde se resuelve la optimización.
 *
 *  El modelo matemático del proyecto está planteado en kilómetros (Tabla I),
 *  por eso toda la optimización ocurre en el plano local y solo se reproyecta
 *  a coordenadas geográficas en el momento de dibujar.
 * ==========================================================================*/
(function (global) {
  'use strict';

  // Radio medio terrestre y constantes de la proyección equirectangular local.
  const R_EARTH_KM = 6371.0088;
  const DEG2RAD = Math.PI / 180;

  /**
   * Origen del plano local: centro geométrico aproximado del Valle de Aburrá.
   * Elegirlo cerca del centroide de los datos mantiene el error de la
   * aproximación equirectangular por debajo de ~0.1 % en un radio de 40 km.
   */
  const ORIGIN = { lat: 6.2518, lon: -75.5636 };

  const kxPerDeg = R_EARTH_KM * DEG2RAD * Math.cos(ORIGIN.lat * DEG2RAD); // km por grado de longitud
  const kyPerDeg = R_EARTH_KM * DEG2RAD;                                   // km por grado de latitud

  /* ---------------------------------------------------------------------- */
  /*  Plano local (ENU aproximado) en kilómetros                             */
  /* ---------------------------------------------------------------------- */

  /** (lat, lon) -> (x, y) en km, con el eje x hacia el este y el y al norte. */
  function toLocal(lat, lon) {
    return {
      x: (lon - ORIGIN.lon) * kxPerDeg,
      y: (lat - ORIGIN.lat) * kyPerDeg
    };
  }

  /** (x, y) en km -> (lat, lon). Inversa exacta de toLocal. */
  function toGeo(x, y) {
    return {
      lat: ORIGIN.lat + y / kyPerDeg,
      lon: ORIGIN.lon + x / kxPerDeg
    };
  }

  /** Distancia euclidiana en el plano local (km). */
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Distancia al cuadrado: la métrica que usa la función objetivo f(x,y). */
  function dist2(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  /**
   * Distancia ortodrómica (Haversine) en km. Se usa solo para validar que la
   * proyección local no introduzca error apreciable frente a la esfera.
   */
  function haversine(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * DEG2RAD;
    const dLon = (lon2 - lon1) * DEG2RAD;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* ---------------------------------------------------------------------- */
  /*  Web Mercator — world pixels a un zoom dado (tesela de 256 px)          */
  /* ---------------------------------------------------------------------- */

  const TILE = 256;

  function lonToWorldX(lon, z) {
    return (lon + 180) / 360 * TILE * Math.pow(2, z);
  }

  function latToWorldY(lat, z) {
    const s = Math.sin(lat * DEG2RAD);
    const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return y * TILE * Math.pow(2, z);
  }

  function worldXToLon(px, z) {
    return px / (TILE * Math.pow(2, z)) * 360 - 180;
  }

  function worldYToLat(py, z) {
    const n = Math.PI - 2 * Math.PI * py / (TILE * Math.pow(2, z));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  /** Metros reales por pixel de pantalla a una latitud y zoom dados. */
  function metersPerPixel(lat, z) {
    return 156543.03392 * Math.cos(lat * DEG2RAD) / Math.pow(2, z);
  }

  global.Geo = {
    ORIGIN, TILE, R_EARTH_KM,
    toLocal, toGeo, dist, dist2, haversine,
    lonToWorldX, latToWorldY, worldXToLon, worldYToLat, metersPerPixel,
    kxPerDeg, kyPerDeg
  };
})(window);
