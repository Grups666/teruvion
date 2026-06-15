/**
 * SpatialDataConnector
 *
 * Normalizes direct open spatial data URLs into the same source contract used
 * by admission, decomposition, and map recomposition. Format-specific parsing
 * is delegated to SpatialResourceSampler; this connector is not domain-specific.
 */

const BaseConnector = require('./BaseConnector');
const SpatialResourceSampler = require('./SpatialResourceSampler');
const {
  inferFormatFromUrl,
  primitiveFromFormat
} = require('../project/RecompositionSemantics');

const SUPPORTED_FORMATS = new Set(['csv', 'geojson', 'shapefile', 'geotiff']);
const MAX_CONTENT_CHARS = 50000;

class SpatialDataConnector extends BaseConnector {
  constructor(config = {}) {
    super(config);
    this.sampler = config.spatialResourceSampler || new SpatialResourceSampler(config);
  }

  canHandle(input) {
    if (typeof input !== 'string') return false;
    try {
      const url = new URL(input);
      if (!url.protocol.startsWith('http')) return false;
      if (!isLikelySpatialDataUrl(url)) return false;
      return SUPPORTED_FORMATS.has(normalizeFormat(inferFormatFromUrl(input)));
    } catch {
      return false;
    }
  }

  async fetch(input) {
    const sample = await this.sampler.sample(input, {
      format: normalizeFormat(inferFormatFromUrl(input))
    });
    const normalized = normalizeSpatialSample(input, sample);

    return {
      type: 'spatial-data',
      sourceType: 'DatasetPage',
      url: input,
      title: normalized.title,
      content: normalized.content,
      metadata: normalized.metadata,
      raw: {
        sampleStatus: sample.status,
        truncated: sample.truncated,
        diagnostics: sample.diagnostics || {}
      }
    };
  }
}

function normalizeSpatialSample(url, sample = {}) {
  const title = sample.title || titleFromUrl(url);
  const format = normalizeFormat(sample.format || inferFormatFromUrl(url));
  const displayPrimitive = primitiveFromFormat(format) || null;
  const geoFeatures = Array.isArray(sample.geoFeatures) ? sample.geoFeatures : [];
  const bbox = sample.spatialCoverage || sample.rasterMetadata?.bbox || null;
  const resource = {
    label: title,
    url,
    type: 'dataset',
    format,
    dataFormat: format,
    displayPrimitive,
    role: 'source data',
    context: `Bounded ${format || 'spatial'} source sample`,
    enrichment: {
      source: 'direct-spatial-sample',
      status: sample.status,
      sampledFeatureCount: sample.sampledFeatureCount || 0,
      fullFeatureCount: sample.featureCount || 0,
      checkedAt: new Date().toISOString()
    },
    reviewHint: sample.status === 'sampled'
      ? `${sample.sampledFeatureCount || 0} feature(s) sampled from direct spatial data source.`
      : 'Spatial source metadata was inspected, but map-ready features may need review.'
  };

  return {
    title,
    content: buildContent({
      title,
      url,
      format,
      sample
    }),
    metadata: {
      type: 'DatasetPage',
      title,
      name: title,
      url,
      sourceUrl: url,
      format,
      dataFormat: format,
      spatialCoverage: bbox,
      featureCount: sample.featureCount || 0,
      sampledFeatureCount: sample.sampledFeatureCount || 0,
      geometryTypes: sample.geometryTypes || [],
      coordinateFields: sample.coordinateFields || null,
      rasterMetadata: sample.rasterMetadata || null,
      datasets: [{
        name: title,
        url,
        format,
        featureCount: sample.featureCount || 0,
        sampledFeatureCount: sample.sampledFeatureCount || 0,
        geometryTypes: sample.geometryTypes || [],
        spatialCoverage: bbox,
        role: 'source'
      }],
      geoFeatures,
      regions: geoFeatures,
      resources: [resource]
    }
  };
}

function buildContent({ title, url, format, sample }) {
  return [
    `Title: ${title}`,
    `Source URL: ${url}`,
    `Format: ${format || 'unknown spatial data'}`,
    `Sampling status: ${sample.status || 'unknown'}`,
    `Feature count: ${sample.featureCount || 0}; sampled ${sample.sampledFeatureCount || 0}`,
    sample.spatialCoverage ? `Spatial coverage bbox: ${sample.spatialCoverage.join(', ')}` : 'Spatial coverage bbox: unavailable',
    sample.geometryTypes?.length ? `Geometry types: ${sample.geometryTypes.join(', ')}` : '',
    sample.rasterMetadata ? `Raster size: ${sample.rasterMetadata.width} x ${sample.rasterMetadata.height}` : '',
    sample.diagnostics?.warning ? `Warning: ${sample.diagnostics.warning}` : ''
  ].filter(Boolean).join('\n').slice(0, MAX_CONTENT_CHARS);
}

function normalizeFormat(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'tif' || normalized === 'tiff') return 'geotiff';
  if (normalized === 'zip') return 'shapefile';
  if (normalized === 'json') return 'geojson';
  return normalized;
}

function isLikelySpatialDataUrl(url) {
  const pathname = url.pathname.toLowerCase();
  return pathname.endsWith('.csv') ||
    pathname.endsWith('.zip') ||
    pathname.endsWith('.shp') ||
    pathname.endsWith('.tif') ||
    pathname.endsWith('.tiff') ||
    pathname.endsWith('.geojson') ||
    (pathname.endsWith('.json') && pathname.includes('geojson'));
}

function titleFromUrl(url) {
  try {
    const filename = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return filename.replace(/\.(csv|zip|shp|tiff?|geojson|json)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Spatial dataset';
  } catch {
    return 'Spatial dataset';
  }
}

module.exports = SpatialDataConnector;
module.exports.normalizeSpatialSample = normalizeSpatialSample;
