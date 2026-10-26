/* ============================================================================
 *  data.js — Caso de estudio: Área Metropolitana del Valle de Aburrá
 *
 *  Los 25 nodos de demanda corresponden a las 16 comunas de Medellín y a los
 *  9 municipios restantes del Área Metropolitana. Las coordenadas geográficas
 *  son reales (centro aproximado de cada unidad territorial); la población es
 *  una cifra de referencia del orden de magnitud de las proyecciones DANE.
 *
 *  La demanda d_i en Mbps NO es un dato medido: se deriva de la población
 *  mediante un factor de intensidad configurable por el usuario. Esto es
 *  coherente con la limitación L2 del documento (datos simulados); lo que el
 *  modelo compara son métodos de optimización, no una red existente.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* --- Nodos de demanda -------------------------------------------------- */
  /* tipo: 'comuna' (Medellín) | 'municipio' (resto del Área Metropolitana)  */
  const NODOS = [
    // --- Medellín: 16 comunas ---
    { id: 'C01', nombre: 'Popular',          tipo: 'comuna',    lat: 6.2960, lon: -75.5460, pob: 130000 },
    { id: 'C02', nombre: 'Santa Cruz',       tipo: 'comuna',    lat: 6.2930, lon: -75.5570, pob: 110000 },
    { id: 'C03', nombre: 'Manrique',         tipo: 'comuna',    lat: 6.2820, lon: -75.5490, pob: 160000 },
    { id: 'C04', nombre: 'Aranjuez',         tipo: 'comuna',    lat: 6.2790, lon: -75.5620, pob: 160000 },
    { id: 'C05', nombre: 'Castilla',         tipo: 'comuna',    lat: 6.2860, lon: -75.5740, pob: 150000 },
    { id: 'C06', nombre: 'Doce de Octubre',  tipo: 'comuna',    lat: 6.3000, lon: -75.5700, pob: 200000 },
    { id: 'C07', nombre: 'Robledo',          tipo: 'comuna',    lat: 6.2860, lon: -75.5930, pob: 180000 },
    { id: 'C08', nombre: 'Villa Hermosa',    tipo: 'comuna',    lat: 6.2560, lon: -75.5460, pob: 140000 },
    { id: 'C09', nombre: 'Buenos Aires',     tipo: 'comuna',    lat: 6.2400, lon: -75.5490, pob: 140000 },
    { id: 'C10', nombre: 'La Candelaria',    tipo: 'comuna',    lat: 6.2480, lon: -75.5680, pob:  85000 },
    { id: 'C11', nombre: 'Laureles-Estadio', tipo: 'comuna',    lat: 6.2450, lon: -75.5930, pob: 120000 },
    { id: 'C12', nombre: 'La América',       tipo: 'comuna',    lat: 6.2520, lon: -75.6050, pob:  95000 },
    { id: 'C13', nombre: 'San Javier',       tipo: 'comuna',    lat: 6.2560, lon: -75.6220, pob: 140000 },
    { id: 'C14', nombre: 'El Poblado',       tipo: 'comuna',    lat: 6.2090, lon: -75.5680, pob: 135000 },
    { id: 'C15', nombre: 'Guayabal',         tipo: 'comuna',    lat: 6.2100, lon: -75.5900, pob:  50000 },
    { id: 'C16', nombre: 'Belén',            tipo: 'comuna',    lat: 6.2300, lon: -75.6020, pob: 200000 },
    // --- Resto del Área Metropolitana: 9 municipios ---
    { id: 'M01', nombre: 'Bello',            tipo: 'municipio', lat: 6.3373, lon: -75.5586, pob: 580000 },
    { id: 'M02', nombre: 'Itagüí',           tipo: 'municipio', lat: 6.1719, lon: -75.6115, pob: 290000 },
    { id: 'M03', nombre: 'Envigado',         tipo: 'municipio', lat: 6.1690, lon: -75.5830, pob: 245000 },
    { id: 'M04', nombre: 'Sabaneta',         tipo: 'municipio', lat: 6.1515, lon: -75.6166, pob:  90000 },
    { id: 'M05', nombre: 'La Estrella',      tipo: 'municipio', lat: 6.1575, lon: -75.6433, pob:  70000 },
    { id: 'M06', nombre: 'Caldas',           tipo: 'municipio', lat: 6.0911, lon: -75.6366, pob:  85000 },
    { id: 'M07', nombre: 'Copacabana',       tipo: 'municipio', lat: 6.3467, lon: -75.5089, pob:  75000 },
    { id: 'M08', nombre: 'Girardota',        tipo: 'municipio', lat: 6.3772, lon: -75.4461, pob:  60000 },
    { id: 'M09', nombre: 'Barbosa',          tipo: 'municipio', lat: 6.4387, lon: -75.3317, pob:  55000 }
  ];

  /* --- Capas cartográficas de referencia --------------------------------- */

  /* Eje del río Aburrá–Medellín, de sur (Caldas) a norte (Barbosa). */
  const RIO = [
    [6.0620, -75.6380], [6.0950, -75.6345], [6.1250, -75.6290], [6.1560, -75.6185],
    [6.1800, -75.6060], [6.2060, -75.5905], [6.2330, -75.5775], [6.2600, -75.5700],
    [6.2900, -75.5630], [6.3180, -75.5560], [6.3420, -75.5390], [6.3560, -75.5050],
    [6.3760, -75.4560], [6.4080, -75.3950], [6.4400, -75.3300]
  ];

  /* Metro de Medellín — Línea A (Niquía ↔ La Estrella). */
  const METRO_A = [
    { n: 'Niquía',        lat: 6.3383, lon: -75.5447 },
    { n: 'Bello',         lat: 6.3318, lon: -75.5536 },
    { n: 'Madera',        lat: 6.3186, lon: -75.5573 },
    { n: 'Acevedo',       lat: 6.2998, lon: -75.5586 },
    { n: 'Tricentenario', lat: 6.2905, lon: -75.5637 },
    { n: 'Caribe',        lat: 6.2793, lon: -75.5695 },
    { n: 'Universidad',   lat: 6.2693, lon: -75.5654 },
    { n: 'Hospital',      lat: 6.2648, lon: -75.5640 },
    { n: 'Prado',         lat: 6.2590, lon: -75.5665 },
    { n: 'Parque Berrío', lat: 6.2503, lon: -75.5685 },
    { n: 'San Antonio',   lat: 6.2471, lon: -75.5702 },
    { n: 'Alpujarra',     lat: 6.2432, lon: -75.5730 },
    { n: 'Exposiciones',  lat: 6.2398, lon: -75.5740 },
    { n: 'Industriales',  lat: 6.2305, lon: -75.5756 },
    { n: 'Poblado',       lat: 6.2124, lon: -75.5784 },
    { n: 'Aguacatala',    lat: 6.1976, lon: -75.5805 },
    { n: 'Ayurá',         lat: 6.1861, lon: -75.5868 },
    { n: 'Envigado',      lat: 6.1743, lon: -75.5918 },
    { n: 'Itagüí',        lat: 6.1639, lon: -75.5985 },
    { n: 'Sabaneta',      lat: 6.1572, lon: -75.6090 },
    { n: 'La Estrella',   lat: 6.1532, lon: -75.6185 }
  ];

  /* Metro de Medellín — Línea B (San Antonio ↔ San Javier). */
  const METRO_B = [
    { n: 'San Antonio',   lat: 6.2471, lon: -75.5702 },
    { n: 'Cisneros',      lat: 6.2490, lon: -75.5745 },
    { n: 'Suramericana',  lat: 6.2535, lon: -75.5840 },
    { n: 'Estadio',       lat: 6.2548, lon: -75.5900 },
    { n: 'Floresta',      lat: 6.2583, lon: -75.5982 },
    { n: 'Santa Lucía',   lat: 6.2560, lon: -75.6060 },
    { n: 'San Javier',    lat: 6.2566, lon: -75.6135 }
  ];

  /* --- Región factible por defecto g(x,y) ≤ 0 ---------------------------- */
  /*
   * Interpretación física: corredor donde el operador tiene predios y fibra
   * disponible. Por defecto es un disco centrado al sur del valle, lo que
   * fuerza a que la restricción quede ACTIVA frente al centroide ponderado y
   * el caso sea interesante (hipótesis H2 del documento).
   */
  const REGION_DEFECTO = {
    tipo: 'circulo',
    centro: { lat: 6.2050, lon: -75.5850 },
    radioKm: 4.5
  };

  /* Vista inicial del mapa. */
  const VISTA = { lat: 6.2518, lon: -75.5636, zoom: 12 };

  global.Datos = { NODOS, RIO, METRO_A, METRO_B, REGION_DEFECTO, VISTA };
})(window);
