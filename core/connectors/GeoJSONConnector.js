/**
 * GeoJSONConnector
 *
 * Normalizes GeoJSON sources into the same metadata contract consumed by
 * admission, decomposition, and recomposition. It is format-specific, not
 * source-specific: no publisher, domain, or known feed assumptions live here.
 */

const fetch = require('node-fetch');
const BaseConnector = require('./BaseConnector');
const {
  primitiveFromGeometry,
  geometryKind
} = require('../project/RecompositionSemantics');

const MAX_FEATURES = 250;
const MAX_CONTENT_CHARS = 50000;

class GeoJSONConnector extends BaseConnector {
  canHandle(input) {
    if (typeof input !== 'string') return false;
    try {
      const url = new URL(input);
      const pathname = url.pathname.toLowerCase();
      return url.protocol.startsWith('http') && (
        pathname.endsWith('.geojson') ||
        pathname.endsWith('.json') && pathname.includes('geojson')
      );
    } catch {
      return false;
    }
  }

  async fetch(input) {
    const response = await fetch(input, {
      headers: {
        Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.5',
        'User-Agent': 'Teruvion/0.12.79 (https://teruvion.org)'
      },
      signal: AbortSignal.timeout(this.config?.timeout || 15000)
    });

    if (!response.ok) {
      throw new Error(`GeoJSON fetch failed: ${response.status}`);
    }

    const text = await response.text();
    const geojson = JSON.parse(text);
    const normalized = normalizeGeoJSON(input, geojson);

    return {
      type: 'geojson',
      sourceType: 'DatasetPage',
      url: input,
      title: normalized.title,
      content: normalized.content,
      metadata: normalized.metadata,
      raw: {
        featureCount: normalized.featureCount,
        truncated: normalized.truncated
      }
    };
  }
}

function normalizeGeoJSON(url, geojson) {
  const features = normalizeFeatures(geojson).slice(0, MAX_FEATURES);
  const fullFeatureCount = normalizeFeatures(geojson).length;
  const bbox = normalizeBbox(geojson.bbox) || bboxFromFeatures(features);
  const geometryTypes = Array.from(new Set(features
    .map(feature => feature.geometry?.type)
    .filter(Boolean)));
  const title = readTitle(url, geojson, features);
  const geoFeatures = features.map((feature, index) => normalizeFeature(url, feature, index));
  const content = buildContent({ title, url, bbox, geometryTypes, fullFeatureCount, truncated: fullFeatureCount > features.length });

  return {
    title,
    featureCount: fullFeatureCount,
    truncated: fullFeatureCount > features.length,
    content,
    metadata: {
      type: 'DatasetPage',
      title,
      name: title,
      url,
      sourceUrl: url,
      format: 'geojson',
      dataFormat: 'geojson',
      spatialCoverage: bbox,
      featureCount: fullFeatureCount,
      sampledFeatureCount: features.length,
      geometryTypes,
      datasets: [{
        name: title,
        url,
        format: 'geojson',
        featureCount: fullFeatureCount,
        sampledFeatureCount: features.length,
        geometryTypes,
        spatialCoverage: bbox,
        role: 'source'
      }],
      geoFeatures,
      regions: geoFeatures,
      resources: [{
        label: title,
        url,
        type: 'dataset',
        format: 'geojson',
        role: 'source data',
        context: 'Normalized GeoJSON source'
      }]
    }
  };
}

function normalizeFeatures(geojson) {
  if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    return geojson.features.filter(feature => feature?.geometry);
  }
  if (geojson?.type === 'Feature' && geojson.geometry) return [geojson];
  if (geojson?.type && geojson.coordinates) {
    return [{ type: 'Feature', properties: {}, geometry: geojson }];
  }
  return [];
}

function normalizeFeature(sourceUrl, feature, index) {
  const properties = feature.properties || {};
  const geometry = feature.geometry || null;
  const label = firstString([
    properties.name,
    properties.NAME,
    properties.title,
    properties.place,
    properties.id,
    feature.id,
    `GeoJSON feature ${index + 1}`
  ]);
  const bbox = normalizeBbox(feature.bbox) || bboxFromGeometry(geometry);

  return {
    id: feature.id ? String(feature.id) : `geo-feature-${index + 1}`,
    name: label,
    type: 'Region',
    geometry,
    bbox,
    displayPrimitive: primitiveFromGeometry(geometry),
    geometryKind: geometryKind(geometry),
    sourceUrl,
    properties: summarizeProperties(properties),
    confidence: 0.9,
    originalText: label
  };
}

function buildContent({ title, url, bbox, geometryTypes, fullFeatureCount, truncated }) {
  return [
    `Title: ${title}`,
    `Source URL: ${url}`,
    `Format: GeoJSON`,
    `Feature count: ${fullFeatureCount}${truncated ? `; sampled ${MAX_FEATURES}` : ''}`,
    `Geometry types: ${geometryTypes.join(', ') || 'unknown'}`,
    bbox ? `Spatial coverage bbox: ${bbox.join(', ')}` : 'Spatial coverage bbox: unavailable'
  ].join('\n').slice(0, MAX_CONTENT_CHARS);
}

function readTitle(url, geojson, features) {
  return firstString([
    geojson?.name,
    geojson?.title,
    features[0]?.properties?.title,
    features[0]?.properties?.dataset,
    filenameTitle(url),
    'GeoJSON dataset'
  ]);
}

function filenameTitle(url) {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(filename)
      .replace(/\.(geo)?json$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function bboxFromFeatures(features) {
  const boxes = features
    .map(feature => normalizeBbox(feature.bbox) || bboxFromGeometry(feature.geometry))
    .filter(Boolean);
  if (boxes.length === 0) return null;
  return boxes.reduce((acc, box) => [
    Math.min(acc[0], box[0]),
    Math.min(acc[1], box[1]),
    Math.max(acc[2], box[2]),
    Math.max(acc[3], box[3])
  ]);
}

function bboxFromGeometry(geometry) {
  const coordinates = collectCoordinates(geometry);
  if (coordinates.length === 0) return null;
  const lons = coordinates.map(point => point[0]).filter(Number.isFinite);
  const lats = coordinates.map(point => point[1]).filter(Number.isFinite);
  if (lons.length === 0 || lats.length === 0) return null;
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats)
  ];
}

function collectCoordinates(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];
  if (geometry.type === 'Point') return [geometry.coordinates].filter(isCoordinate);
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') return geometry.coordinates.filter(isCoordinate);
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates.flat().filter(isCoordinate);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2).filter(isCoordinate);
  return [];
}

function normalizeBbox(value) {
  if (!Array.isArray(value) || value.length < 4) return null;
  const bbox = value.slice(0, 4).map(Number);
  return bbox.every(Number.isFinite) ? bbox : null;
}

function isCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function summarizeProperties(properties) {
  const output = {};
  for (const [key, value] of Object.entries(properties).slice(0, 12)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    output[key] = value;
  }
  return output;
}

function firstString(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

module.exports = GeoJSONConnector;
module.exports.normalizeGeoJSON = normalizeGeoJSON;
