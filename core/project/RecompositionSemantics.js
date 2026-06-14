/**
 * Shared recomposition semantics.
 *
 * Decomposition produces source-grounded parts. Recomposition modules assemble
 * those parts for different views. This file keeps the shared display language
 * stable so detail, map, and future modules do not invent parallel terms.
 */

const DISPLAY_PRIMITIVES = Object.freeze({
  REGION_LAYER: 'region-layer',
  POINT_LAYER: 'point-layer',
  ROUTE_OR_FLOW_LAYER: 'route-or-flow-layer',
  RASTER_LAYER: 'raster-layer',
  CLASSIFIED_AREA_LAYER: 'classified-area-layer',
  SPATIAL_ANCHOR: 'spatial-anchor',
  ATTACHED_RESULTS: 'attached-results',
  ATTACHED_TABLE: 'attached-table',
  ATTACHED_CHART_OR_FIGURE: 'attached-chart-or-figure',
  ATTACHED_TIME_SERIES: 'attached-time-series',
  ATTACHED_CHART_OR_VALUE: 'attached-chart-or-value',
  SOURCE_FIGURE_OVERLAY: 'source-figure-overlay',
  EVIDENCE_CHAIN_VIEW: 'evidence-chain-view',
  WORKFLOW_RESOURCE: 'workflow-resource',
  EVIDENCE_RESOURCE: 'evidence-resource'
});

const DISPLAY_PRIMITIVE_LABELS = Object.freeze({
  [DISPLAY_PRIMITIVES.REGION_LAYER]: 'Regions',
  [DISPLAY_PRIMITIVES.POINT_LAYER]: 'Points',
  [DISPLAY_PRIMITIVES.ROUTE_OR_FLOW_LAYER]: 'Routes And Flows',
  [DISPLAY_PRIMITIVES.RASTER_LAYER]: 'Raster Surfaces',
  [DISPLAY_PRIMITIVES.CLASSIFIED_AREA_LAYER]: 'Classified Areas',
  [DISPLAY_PRIMITIVES.SPATIAL_ANCHOR]: 'Spatial Anchors',
  [DISPLAY_PRIMITIVES.ATTACHED_RESULTS]: 'Attached Results',
  [DISPLAY_PRIMITIVES.ATTACHED_TABLE]: 'Tables',
  [DISPLAY_PRIMITIVES.ATTACHED_CHART_OR_FIGURE]: 'Figures And Charts',
  [DISPLAY_PRIMITIVES.ATTACHED_TIME_SERIES]: 'Time Series',
  [DISPLAY_PRIMITIVES.ATTACHED_CHART_OR_VALUE]: 'Values And Charts',
  [DISPLAY_PRIMITIVES.SOURCE_FIGURE_OVERLAY]: 'Source Figure Overlays',
  [DISPLAY_PRIMITIVES.EVIDENCE_CHAIN_VIEW]: 'Evidence Chains',
  [DISPLAY_PRIMITIVES.WORKFLOW_RESOURCE]: 'Workflow Resources',
  [DISPLAY_PRIMITIVES.EVIDENCE_RESOURCE]: 'Evidence Resources'
});

const OPEN_SPATIAL_FORMATS = Object.freeze({
  geojson: DISPLAY_PRIMITIVES.REGION_LAYER,
  shapefile: DISPLAY_PRIMITIVES.REGION_LAYER,
  gpkg: DISPLAY_PRIMITIVES.REGION_LAYER,
  kml: DISPLAY_PRIMITIVES.REGION_LAYER,
  geotiff: DISPLAY_PRIMITIVES.RASTER_LAYER,
  netcdf: DISPLAY_PRIMITIVES.RASTER_LAYER,
  zarr: DISPLAY_PRIMITIVES.RASTER_LAYER,
  raster: DISPLAY_PRIMITIVES.RASTER_LAYER,
  csv: DISPLAY_PRIMITIVES.ATTACHED_TABLE,
  tsv: DISPLAY_PRIMITIVES.ATTACHED_TABLE,
  xlsx: DISPLAY_PRIMITIVES.ATTACHED_TABLE,
  table: DISPLAY_PRIMITIVES.ATTACHED_TABLE
});

const ALLOWED_DISPLAY_PRIMITIVES = new Set(Object.values(DISPLAY_PRIMITIVES));

function normalizeDisplayPrimitive(value) {
  const normalized = String(value || '').trim();
  return ALLOWED_DISPLAY_PRIMITIVES.has(normalized) ? normalized : '';
}

function labelForDisplayPrimitive(primitive) {
  return DISPLAY_PRIMITIVE_LABELS[primitive] || primitive || 'Map Layer';
}

function primitiveFromGeometry(geometry) {
  const kind = geometryKind(geometry);
  if (kind === 'point') return DISPLAY_PRIMITIVES.POINT_LAYER;
  if (kind === 'region') return DISPLAY_PRIMITIVES.REGION_LAYER;
  if (kind === 'line') return DISPLAY_PRIMITIVES.ROUTE_OR_FLOW_LAYER;
  return DISPLAY_PRIMITIVES.REGION_LAYER;
}

function geometryKind(geometry) {
  if (!geometry || typeof geometry !== 'object') return 'none';
  if (geometry.type === 'Point' || geometry.type === 'MultiPoint') return 'point';
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') return 'region';
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') return 'line';
  return 'geometry';
}

function inferFormatFromUrl(url) {
  if (typeof url !== 'string') return '';
  const pathname = url.split('?')[0].toLowerCase();
  if (pathname.endsWith('.geojson') || pathname.endsWith('.json')) return 'geojson';
  if (pathname.endsWith('.shp') || pathname.endsWith('.zip')) return 'shapefile';
  if (pathname.endsWith('.gpkg')) return 'gpkg';
  if (pathname.endsWith('.kml')) return 'kml';
  if (pathname.endsWith('.tif') || pathname.endsWith('.tiff')) return 'geotiff';
  if (pathname.endsWith('.nc')) return 'netcdf';
  if (pathname.endsWith('.csv')) return 'csv';
  if (pathname.endsWith('.tsv')) return 'tsv';
  if (pathname.endsWith('.xlsx')) return 'xlsx';
  return '';
}

function primitiveFromFormat(format, fallback = '') {
  return OPEN_SPATIAL_FORMATS[String(format || '').toLowerCase()] || fallback;
}

module.exports = {
  DISPLAY_PRIMITIVES,
  normalizeDisplayPrimitive,
  labelForDisplayPrimitive,
  primitiveFromGeometry,
  geometryKind,
  inferFormatFromUrl,
  primitiveFromFormat
};
