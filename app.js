/* ════════════════════════════════════════════════════════
   Tiempo de llegada de los bomberos en España
   ════════════════════════════════════════════════════════ */

// Ficheros propios de /mapa (no symlinks a /data, para que la carpeta sea autocontenida
// y se pueda subir a git). El .pmtiles unificado pesaba 261 MB (por encima del límite
// práctico de git); en su lugar, 07_geojson_a_pmtiles.py reparte las provincias en varios
// ficheros "grupo-NN.pmtiles" de ~38 MB cada uno dentro de PMTILES_DIR, junto a un
// manifest.json que dice en qué grupo está cada provincia — ver servir.py sobre por qué
// hace falta ese servidor en vez de `python3 -m http.server` (soporte de peticiones Range).
const PMTILES_DIR = 'pmtiles';
const PMTILES_MANIFEST = `${PMTILES_DIR}/manifest.json`;
const PARQUES_FILE = 'parque_bomberos.geojson';
// Límites de provincia (geoBoundaries ADM2), convertido desde
// /Users/miguel.ros/Desktop/Recursos/spain-provincias.geojson con tippecanoe + pmtiles.
const PROVINCIAS_PMTILES_FILE = 'provincias.pmtiles';

const CENTRO_INICIAL = { center: [-3.7, 37.5], zoom: 4.2 };

// Una capa (source-layer) por provincia dentro del mismo .pmtiles unificado — ver
// 07_geojson_a_pmtiles.py, que usa el nombre de cada geojson de origen como nombre de capa
// ("benchmark_<provincia>"). Lista generada a partir de data/geojson/*.geojson: 48
// provincias (faltan Álava, Bizkaia, Gipuzkoa y Navarra — no están en el benchmark de
// origen, no es un descarte de este mapa).
const PROVINCIAS = [
  'a_coruna', 'albacete', 'alicante', 'almeria', 'asturias', 'avila', 'badajoz', 'baleares',
  'barcelona', 'burgos', 'caceres', 'cadiz', 'cantabria', 'castellon', 'ceuta', 'ciudad_real',
  'cordoba', 'cuenca', 'girona', 'granada', 'guadalajara', 'huelva', 'huesca', 'jaen',
  'la_rioja', 'las_palmas', 'leon', 'lleida', 'lugo', 'madrid', 'malaga', 'melilla',
  'murcia', 'ourense', 'palencia', 'pontevedra', 'salamanca', 'segovia', 'sevilla', 'soria',
  'tarragona', 'tenerife', 'teruel', 'toledo', 'valencia', 'valladolid', 'zamora', 'zaragoza',
];
const TIEMPO_LAYER_IDS = PROVINCIAS.map(p => `tiempo-${p}`);

const PARQUE_COLOR = '#D7263D'; // rojo de parque de bomberos — deliberadamente fuera de la
                                 // familia de verdes de la rampa de tiempo, para no confundir
                                 // identidad (un parque) con magnitud (un tiempo de llegada).

/* Cortes en minutos cerrados, rampa de un solo tono (mismo H≈165° OKLCH que el acento
   de marca) con la clase central (6-10 min) fijada exactamente en el acento #01F3B3 —
   dos pasos más claros hacia el verde casi blanco, dos más oscuros hacia un verde bosque. */
const TIEMPO_CLASES = [
  { max: 3,        color: '#F7FEFA', label: '0 – 3 min' },
  { max: 6,        color: '#9EFBD4', label: '3 – 6 min' },
  { max: 10,       color: '#01F3B3', label: '6 – 10 min' },
  { max: 20,       color: '#00A276', label: '10 – 20 min' },
  { max: Infinity, color: '#18543E', label: '+20 min' },
];
const TIEMPO_SIN_DATO = '#BEC6C4';
const PUNTO_OUTLINE = '#232323'; // outline_color del QML (35,35,35)

// ['step', get, color0, corte1, color1, corte2, color2, ...] — reconstruye la expresión
// MapLibre a partir de TIEMPO_CLASES en vez de escribirla a mano, para que una clase no
// pueda quedar desincronizada entre la rampa y la leyenda (ver renderLeyenda).
const EXPR_COLOR_TIEMPO = ['step', ['get', 'tiempo_min'], TIEMPO_CLASES[0].color];
for (let i = 1; i < TIEMPO_CLASES.length; i++) {
  EXPR_COLOR_TIEMPO.push(TIEMPO_CLASES[i - 1].max, TIEMPO_CLASES[i].color);
}

const PAINT_PUNTOS = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.1, 8, 2.2, 12, 4],
  'circle-color': ['case', ['has', 'tiempo_min'], EXPR_COLOR_TIEMPO, TIEMPO_SIN_DATO],
  'circle-stroke-color': PUNTO_OUTLINE,
  'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 0.25, 8, 0.4, 12, 0.7],
  'circle-opacity': 1,
  'circle-stroke-opacity': 0.6,
};

// Formato de minutos/km compartido por el popup de edificio y la leyenda.
function formatearMinutos(v) {
  if (v === undefined || v === null) return null;
  return Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' min';
}
function formatearKm(v) {
  if (v === undefined || v === null) return null;
  return Number(v).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' km';
}
function nombreProvincia(slug) {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Mismo criterio que EXPR_COLOR_TIEMPO (paso a paso, acumulando el ultimo umbral
// superado) pero evaluado en JS para poder colorear el popup del edificio igual que
// su punto en el mapa, en vez de usar siempre el rojo de "parque".
function colorParaTiempo(tiempoMin) {
  if (tiempoMin === undefined || tiempoMin === null) return TIEMPO_SIN_DATO;
  let color = TIEMPO_CLASES[0].color;
  for (let i = 1; i < TIEMPO_CLASES.length; i++) {
    if (tiempoMin >= TIEMPO_CLASES[i - 1].max) color = TIEMPO_CLASES[i].color;
    else break;
  }
  return color;
}

// Texto blanco sobre colores oscuros, texto oscuro sobre colores claros (las primeras
// clases de la rampa "Greens" son casi blancas, así que el texto blanco fijo quedaba ilegible).
function colorTextoLegible(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? '#1F2D2A' : '#FFFFFF';
}

const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: {}, layers: [] },
  center: CENTRO_INICIAL.center,
  zoom: CENTRO_INICIAL.zoom,
  minZoom: 3, // minzoom real del pmtiles (ver `pmtiles show`); por debajo no hay teselas
  maxBounds: [[-35, 20], [20, 56]],
  antialias: true,
});

let popup = null;
let mostrarParques = false;

/* ── Leyenda ──
   Las 5 clases + etiquetas vienen de TIEMPO_CLASES (mismos cortes por cuantiles que
   qgis/style-benchmarks-bomberos.qml), no de un degradado continuo: así la leyenda
   corresponde exactamente a los colores que de verdad puede tener un punto en el mapa. */
function renderLeyenda() {
  const filas = TIEMPO_CLASES
    .map(c => `<div class="lp-step"><span class="lp-dot" style="background:${c.color};box-shadow:0 0 0 1px ${PUNTO_OUTLINE}"></span>${c.label}</div>`)
    .join('');
  document.getElementById('leyenda-panel').innerHTML = `
    <div class="lp-titulo">Tiempo estimado de llegada de los bomberos</div>
    <div class="lp-steps">${filas}</div>
    <div class="lp-sep"></div>
    <div class="lp-step"><span class="lp-dot" style="background:${PARQUE_COLOR};box-shadow:0 0 0 1.5px #494949"></span>Parque de bomberos</div>`;
}

document.getElementById('reset-btn').addEventListener('click', () =>
  map.flyTo({ center: CENTRO_INICIAL.center, zoom: CENTRO_INICIAL.zoom, duration: 1000 })
);

const parquesBtnEl = document.getElementById('parques-btn');
parquesBtnEl.addEventListener('click', () => {
  mostrarParques = !mostrarParques;
  actualizarCapaParques();
});

/* ── Geocoder (Nominatim/OSM) ──
   Sin API key: Nominatim es de uso libre con límite de ~1 req/s y pide identificar la
   app (aquí basta el Referer que el propio navegador ya manda) — el debounce de 400ms
   ya evita disparar una petición por cada pulsación de tecla. */
const GEOCODER_DEBOUNCE_MS = 400;
const GEOCODER_MIN_CHARS = 3;
const geocoderInputEl = document.getElementById('geocoder-input');
const geocoderResultadosEl = document.getElementById('geocoder-resultados');

let geocoderTimer = null;
let geocoderAbort = null;
let geocoderResultados = [];
let geocoderActivo = -1;

function cerrarGeocoderResultados() {
  geocoderResultadosEl.classList.remove('is-open');
  geocoderResultadosEl.innerHTML = '';
  geocoderResultados = [];
  geocoderActivo = -1;
}

function renderGeocoderResultados() {
  if (geocoderResultados.length === 0) {
    geocoderResultadosEl.innerHTML = '<div class="geocoder-item geocoder-item--vacio">Sin resultados</div>';
  } else {
    geocoderResultadosEl.innerHTML = geocoderResultados.map((r, i) => `
      <button type="button" class="geocoder-item${i === geocoderActivo ? ' is-activo' : ''}" data-indice="${i}">
        ${r.display_name}
      </button>`).join('');
  }
  geocoderResultadosEl.classList.add('is-open');
}

function irAResultadoGeocoder(resultado) {
  map.flyTo({ center: [Number(resultado.lon), Number(resultado.lat)], zoom: 14, duration: 1200 });
  geocoderInputEl.value = resultado.display_name;
  cerrarGeocoderResultados();
}

async function buscarGeocoder(consulta) {
  if (geocoderAbort) geocoderAbort.abort();
  geocoderAbort = new AbortController();

  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=es&limit=6&accept-language=es&q=${encodeURIComponent(consulta)}`;
  try {
    const respuesta = await fetch(url, { signal: geocoderAbort.signal });
    geocoderResultados = await respuesta.json();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Error buscando dirección:', err);
    geocoderResultadosEl.innerHTML = '<div class="geocoder-item geocoder-item--error">Error al buscar</div>';
    geocoderResultadosEl.classList.add('is-open');
    return;
  }
  geocoderActivo = -1;
  renderGeocoderResultados();
}

geocoderInputEl.addEventListener('input', () => {
  clearTimeout(geocoderTimer);
  const consulta = geocoderInputEl.value.trim();
  if (consulta.length < GEOCODER_MIN_CHARS) { cerrarGeocoderResultados(); return; }
  geocoderTimer = setTimeout(() => buscarGeocoder(consulta), GEOCODER_DEBOUNCE_MS);
});

geocoderResultadosEl.addEventListener('click', e => {
  const boton = e.target.closest('.geocoder-item[data-indice]');
  if (!boton) return;
  irAResultadoGeocoder(geocoderResultados[Number(boton.dataset.indice)]);
});

geocoderInputEl.addEventListener('keydown', e => {
  if (!geocoderResultadosEl.classList.contains('is-open') || geocoderResultados.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    geocoderActivo = (geocoderActivo + 1) % geocoderResultados.length;
    renderGeocoderResultados();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    geocoderActivo = (geocoderActivo - 1 + geocoderResultados.length) % geocoderResultados.length;
    renderGeocoderResultados();
  } else if (e.key === 'Enter' && geocoderActivo >= 0) {
    e.preventDefault();
    irAResultadoGeocoder(geocoderResultados[geocoderActivo]);
  } else if (e.key === 'Escape') {
    cerrarGeocoderResultados();
  }
});

document.addEventListener('click', e => {
  if (!document.getElementById('geocoder').contains(e.target)) cerrarGeocoderResultados();
});
function actualizarCapaParques() {
  if (!map.getLayer('parques-circle')) return;
  map.setLayoutProperty('parques-circle', 'visibility', mostrarParques ? 'visible' : 'none');
  parquesBtnEl.textContent = mostrarParques ? 'Ocultar parques' : 'Mostrar parques';
  parquesBtnEl.classList.toggle('active', mostrarParques);
}

/* ── Carga del mapa ── */
map.on('load', async () => { try {

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

  map.addSource('basemap', {
    type: 'raster',
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  map.addLayer({
    id: 'basemap',
    type: 'raster',
    source: 'basemap',
    paint: {
      'raster-saturation': -0.75,
      'raster-hue-rotate': 22,
      'raster-brightness-min': 0.42,
      'raster-brightness-max': 0.96,
      'raster-contrast': -0.05,
    },
  });

  // Límites de provincia (geoBoundaries ADM2) — solo el contorno, sin relleno, como
  // referencia geográfica por debajo de los puntos de edificios/parques.
  map.addSource('provincias', { type: 'vector', url: `pmtiles://${PROVINCIAS_PMTILES_FILE}` });
  map.addLayer({
    id: 'provincias-borde',
    type: 'line',
    source: 'provincias',
    'source-layer': 'provincias',
    paint: {
      'line-color': '#494949',
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1, 12, 1.5],
    },
  });

  // Cada provincia vive en su propio .pmtiles de grupo (ver manifest.json); varias
  // provincias comparten fichero de grupo, así que primero se crea una fuente vector por
  // cada fichero de grupo distinto (no una por provincia) y luego cada provincia añade su
  // propia capa apuntando al grupo que le toque — un layer solo puede apuntar a un
  // source-layer a la vez, no hay comodín para "todas las capas de esta fuente".
  const manifest = await fetch(PMTILES_MANIFEST).then(r => r.json());
  const gruposUnicos = [...new Set(Object.values(manifest))];
  gruposUnicos.forEach(grupo => {
    map.addSource(`edificios-${grupo}`, { type: 'vector', url: `pmtiles://${PMTILES_DIR}/${grupo}` });
  });
  PROVINCIAS.forEach(slug => {
    const grupo = manifest[slug];
    if (!grupo) { console.warn(`Sin grupo pmtiles para la provincia '${slug}' (revisa ${PMTILES_MANIFEST})`); return; }
    map.addLayer({
      id: `tiempo-${slug}`,
      type: 'circle',
      source: `edificios-${grupo}`,
      'source-layer': `benchmark_${slug}`,
      paint: PAINT_PUNTOS,
    });
  });

  map.addSource('parques', { type: 'geojson', data: PARQUES_FILE });
  map.addLayer({
    id: 'parques-circle',
    type: 'circle',
    source: 'parques',
    paint: {
      'circle-radius':         ['interpolate', ['linear'], ['zoom'], 4, 2.5, 8, 4, 14, 7],
      'circle-color':          PARQUE_COLOR,
      'circle-stroke-width':   1.5,
      'circle-stroke-color':   '#494949',
      'circle-opacity':        0.95,
    },
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.on('mouseenter', TIEMPO_LAYER_IDS, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', TIEMPO_LAYER_IDS, () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'parques-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'parques-circle', () => { map.getCanvas().style.cursor = ''; });

  function mostrarPopupEdificio(p, lngLat, slug) {
    const colorPunto = colorParaTiempo(p.tiempo_min);
    const colorTexto = colorTextoLegible(colorPunto);
    const filas = [
      { label: 'Tiempo estimado de llegada', valor: formatearMinutos(p.tiempo_min) },
      { label: 'Distancia por carretera', valor: formatearKm(p.distancia_km) },
      { label: 'Provincia', valor: nombreProvincia(slug) },
      { label: 'Parque más cercano', valor: p.parque_id, ancha: true },
    ].filter(f => f.valor !== undefined && f.valor !== null && f.valor !== '');

    const html = `
      <div>
        <div class="pp-bar" style="background:${colorPunto}"></div>
        <div class="pp-inner">
          <span class="pp-badge" style="background:${colorPunto};color:${colorTexto}">Edificio</span>
          <div class="pp-filas">${filas.map(f => `
            <div class="pp-stat${f.ancha ? ' pp-stat--ancha' : ''}">
              <span class="pp-stat-k">${f.label}</span>
              <span class="pp-stat-v">${f.valor}</span>
            </div>`).join('')}</div>
        </div>
      </div>`;

    if (!popup) popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 10, maxWidth: '262px' });
    popup.setLngLat(lngLat).setHTML(html).addTo(map);
  }

  function mostrarPopupParque(p, lngLat) {
    const locLine = [p.ciudad, p.provincia].filter(Boolean).join(', ');

    const html = `
      <div>
        <div class="pp-bar" style="background:${PARQUE_COLOR}"></div>
        <div class="pp-inner">
          <span class="pp-badge" style="background:${PARQUE_COLOR};color:#FFFFFF">Parque de bomberos</span>
          <p class="pp-nombre">${p.nombre || '—'}</p>
          ${p.direccion ? `<p class="pp-tipo">${p.direccion}</p>` : ''}
          ${locLine ? `
            <div class="pp-sep"></div>
            <div class="pp-filas">
              <div class="pp-stat pp-stat--ancha"><span class="pp-stat-k">Localización</span><span class="pp-stat-v">${locLine}</span></div>
            </div>` : ''}
        </div>
      </div>`;

    if (!popup) popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 10, maxWidth: '262px' });
    popup.setLngLat(lngLat).setHTML(html).addTo(map);
  }

  map.on('click', e => {
    const parque = map.queryRenderedFeatures(e.point, { layers: ['parques-circle'] })[0];
    if (parque) { mostrarPopupParque(parque.properties, e.lngLat); return; }

    const edificio = map.queryRenderedFeatures(e.point, { layers: TIEMPO_LAYER_IDS })[0];
    if (edificio) {
      const slug = edificio.layer.id.replace(/^tiempo-/, '');
      mostrarPopupEdificio(edificio.properties, e.lngLat, slug);
      return;
    }

    if (popup?.isOpen()) popup.remove();
  });

  renderLeyenda();
  actualizarCapaParques();

} catch (err) {
  console.error('Error inicializando el mapa:', err);
}});

/* ── Layout responsivo: alto real de la cabecera ──
   La columna de controles se posiciona "debajo de la cabecera" con calc() sobre --header-h
   (ver :root en styles.css) en vez de un top en px fijo a mano, para que no se rompa si la
   cabecera pasa a dos líneas en pantallas estrechas. */
function medirLayout() {
  const header = document.getElementById('header');
  if (!header) return;
  document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
}
window.addEventListener('resize', medirLayout);
window.addEventListener('orientationchange', medirLayout);
if ('ResizeObserver' in window) {
  new ResizeObserver(medirLayout).observe(document.getElementById('header'));
}
medirLayout();
