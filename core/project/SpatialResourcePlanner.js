/**
 * SpatialResourcePlanner
 *
 * Scores source-linked resources for map recomposition without fetching or
 * executing them. It exposes what can be rendered now, what needs bounded
 * sampling, and what should stay as evidence/resource context.
 */

const {
  DISPLAY_PRIMITIVES,
  inferFormatFromUrl,
  primitiveFromFormat,
  labelForDisplayPrimitive
} = require('./RecompositionSemantics');

const SPATIAL_FORMATS = new Set([
  'geojson',
  'shapefile',
  'gpkg',
  'kml',
  'geotiff',
  'netcdf',
  'zarr',
  'raster',
  'csv',
  'tsv',
  'xlsx'
]);

function buildSpatialResourcePlan(resources = []) {
  const candidates = resources
    .map(normalizeResourceCandidate)
    .filter(candidate => candidate && candidate.mapRelevance !== 'none')
    .sort(compareCandidates);

  return {
    schemaVersion: 'spatial-resource-plan-v1',
    candidateCount: candidates.length,
    candidates,
    summary: summarizeCandidates(candidates)
  };
}

function normalizeResourceCandidate(resource = {}) {
  const evidence = resource.evidence || {};
  const url = evidence.url || resource.url || evidence.sourceUrl || evidence.imageUrl || null;
  const format = normalizeFormat(
    resource.format
    || resource.dataFormat
    || evidence.format
    || inferFormatFromUrl(url)
  );
  const displayPrimitive = resource.displayPrimitive
    || primitiveFromFormat(format)
    || primitiveFromKind(resource.kind);
  const kind = String(resource.kind || resource.type || '').toLowerCase();
  const mapRelevance = chooseMapRelevance({ url, format, displayPrimitive, kind });
  if (mapRelevance === 'none') return null;

  const readiness = chooseReadiness({ resource, format, displayPrimitive, url });
  return {
    id: resource.id || stableId('spatial-resource', url || resource.label || kind),
    label: resource.label || resource.title || readableNameFromUrl(url) || labelForDisplayPrimitive(displayPrimitive),
    url,
    kind: kind || 'resource',
    format: format || null,
    displayPrimitive: displayPrimitive || DISPLAY_PRIMITIVES.EVIDENCE_RESOURCE,
    mapRelevance,
    readiness,
    geometryIntent: geometryIntent(displayPrimitive, format),
    reason: candidateReason({ readiness, format, displayPrimitive, resource }),
    processing: processingSteps({ readiness, format, displayPrimitive }),
    provenance: resource.provenance || null,
    evidence: {
      role: evidence.role || resource.role || '',
      reviewHint: evidence.reviewHint || resource.reviewHint || '',
      renderability: resource.renderability || null
    }
  };
}

function chooseMapRelevance({ url, format, displayPrimitive, kind }) {
  if (!url) return 'none';
  if (SPATIAL_FORMATS.has(format)) return 'spatial-data';
  if ([
    DISPLAY_PRIMITIVES.REGION_LAYER,
    DISPLAY_PRIMITIVES.POINT_LAYER,
    DISPLAY_PRIMITIVES.ROUTE_OR_FLOW_LAYER,
    DISPLAY_PRIMITIVES.RASTER_LAYER,
    DISPLAY_PRIMITIVES.CLASSIFIED_AREA_LAYER,
    DISPLAY_PRIMITIVES.ATTACHED_TABLE
  ].includes(displayPrimitive)) {
    return 'spatial-data';
  }
  if (['dataset', 'data', 'supplement'].includes(kind)) return 'possible-spatial-data';
  return 'none';
}

function chooseReadiness({ resource, format, displayPrimitive, url }) {
  if (resource.samplingEligible === false) return 'requires-light-processing';
  if (
    ['linked-geojson-sample', 'linked-spatial-sample', 'direct-spatial-sample'].includes(resource.enrichment?.source) &&
    ['sampled', 'metadata-sampled'].includes(resource.enrichment?.status)
  ) {
    return 'rendered-from-linked-resource';
  }
  if (['geojson', 'csv', 'shapefile', 'geotiff'].includes(format) && url) return 'sampleable-now';
  if ([DISPLAY_PRIMITIVES.RASTER_LAYER, DISPLAY_PRIMITIVES.REGION_LAYER, DISPLAY_PRIMITIVES.ATTACHED_TABLE].includes(displayPrimitive)) {
    return 'requires-light-processing';
  }
  if (displayPrimitive === DISPLAY_PRIMITIVES.WORKFLOW_RESOURCE) return 'blocked-code-execution';
  return 'needs-review';
}

function geometryIntent(displayPrimitive, format) {
  if (displayPrimitive === DISPLAY_PRIMITIVES.POINT_LAYER) return 'points';
  if (displayPrimitive === DISPLAY_PRIMITIVES.ROUTE_OR_FLOW_LAYER) return 'lines-or-flows';
  if (displayPrimitive === DISPLAY_PRIMITIVES.RASTER_LAYER || ['geotiff', 'netcdf', 'zarr', 'raster'].includes(format)) return 'raster-surface';
  if ([DISPLAY_PRIMITIVES.REGION_LAYER, DISPLAY_PRIMITIVES.CLASSIFIED_AREA_LAYER].includes(displayPrimitive)) return 'regions';
  if (displayPrimitive === DISPLAY_PRIMITIVES.ATTACHED_TABLE) return 'tabular-spatial-candidate';
  return 'unknown';
}

function candidateReason({ readiness, format, displayPrimitive, resource }) {
  if (readiness === 'rendered-from-linked-resource') {
    const count = resource.enrichment?.sampledFeatureCount;
    return count ? `${count} linked spatial features were sampled into the map contract.` : 'Linked spatial features were sampled into the map contract.';
  }
  if (readiness === 'sampleable-now') return 'Direct open spatial resource can be bounded-sampled without executing code.';
  if (readiness === 'requires-light-processing') {
    return `${format || labelForDisplayPrimitive(displayPrimitive)} needs a bounded parser or server-side sampler before display.`;
  }
  if (readiness === 'blocked-code-execution') return 'Repository resources require static review or sandboxed execution before producing map results.';
  return 'Resource may contain spatial data, but its map-ready structure is not verified yet.';
}

function processingSteps({ readiness, format, displayPrimitive }) {
  if (readiness === 'rendered-from-linked-resource') return ['inspect feature attributes', 'style by semantic fields', 'preserve linked-resource provenance'];
  if (readiness === 'sampleable-now') return ['fetch with bounded spatial sampler', 'sample features or raster metadata', 'normalize properties', 'render as map layer'];
  if (format === 'geotiff' || displayPrimitive === DISPLAY_PRIMITIVES.RASTER_LAYER) return ['download bounded metadata', 'tile or sample raster', 'derive legend', 'render clipped preview'];
  if (format === 'shapefile' || format === 'gpkg') return ['download archive metadata', 'extract bounded vector sample', 'normalize properties', 'render as region/line layer'];
  if (displayPrimitive === DISPLAY_PRIMITIVES.ATTACHED_TABLE) return ['inspect columns', 'detect coordinates or region keys', 'sample rows', 'join or geocode with explicit provenance'];
  return ['review source resource', 'verify spatial fields', 'choose safe sampler'];
}

function summarizeCandidates(candidates) {
  const counts = candidates.reduce((acc, candidate) => {
    acc[candidate.readiness] = (acc[candidate.readiness] || 0) + 1;
    return acc;
  }, {});
  const actionable = candidates.filter(candidate => ['rendered-from-linked-resource', 'sampleable-now', 'requires-light-processing'].includes(candidate.readiness)).length;
  return {
    actionable,
    byReadiness: counts,
    headline: candidates.length > 0
      ? `${candidates.length} spatial resource candidate(s), ${actionable} actionable with bounded processing.`
      : 'No spatial resource candidates found.'
  };
}

function compareCandidates(a, b) {
  return readinessScore(b.readiness) - readinessScore(a.readiness)
    || String(a.label).localeCompare(String(b.label));
}

function readinessScore(value) {
  return {
    'rendered-from-linked-resource': 5,
    'sampleable-now': 4,
    'requires-light-processing': 3,
    'needs-review': 2,
    'blocked-code-execution': 1
  }[value] || 0;
}

function primitiveFromKind(kind) {
  const value = String(kind || '').toLowerCase();
  if (value.includes('raster')) return DISPLAY_PRIMITIVES.RASTER_LAYER;
  if (value.includes('table')) return DISPLAY_PRIMITIVES.ATTACHED_TABLE;
  if (value.includes('dataset') || value.includes('data')) return DISPLAY_PRIMITIVES.EVIDENCE_RESOURCE;
  return '';
}

function normalizeFormat(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'tif' || normalized === 'tiff') return 'geotiff';
  if (normalized === 'json') return 'geojson';
  if (normalized === 'zip') return 'shapefile';
  return normalized;
}

function readableNameFromUrl(url) {
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.(geojson|json|zip|gpkg|tiff?|nc|csv|tsv|xlsx)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function stableId(prefix, value) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${prefix}-${slug || 'resource'}`;
}

module.exports = {
  buildSpatialResourcePlan
};
