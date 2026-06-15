/**
 * SpatialResourceSampler
 *
 * Bounded readers for open spatial resource formats. This module samples data
 * into the normalized geoFeatures/resource metadata contract used by
 * decomposition and map recomposition. It never executes remote code.
 */

const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const shapefile = require('shapefile');
const GeoTIFF = require('geotiff');
const GeoJSONConnector = require('./GeoJSONConnector');
const {
  primitiveFromGeometry,
  geometryKind,
  inferFormatFromUrl
} = require('../project/RecompositionSemantics');

const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  maxTextBytes: 4 * 1024 * 1024,
  maxFeatures: 250,
  maxCsvRows: 500
});

class SpatialResourceSampler {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_LIMITS,
      ...config,
      ...(config.spatialSampling || {})
    };
  }

  canSample(url, resource = {}) {
    const format = normalizeFormat(resource.format || resource.dataFormat || inferFormatFromUrl(url));
    if (format === 'geojson' && !resource.format && !resource.dataFormat && !isLikelyGeoJSONUrl(url)) return false;
    return ['geojson', 'csv', 'shapefile', 'geotiff'].includes(format);
  }

  async sample(url, resource = {}, options = {}) {
    const format = normalizeFormat(resource.format || resource.dataFormat || inferFormatFromUrl(url));
    if (format === 'geojson') return this.sampleGeoJSON(url, resource, options);
    if (format === 'csv') return this.sampleCsv(url, resource, options);
    if (format === 'shapefile') return this.sampleShapefileZip(url, resource, options);
    if (format === 'geotiff') return this.sampleGeoTiff(url, resource, options);
    throw new Error(`Unsupported spatial sample format: ${format || 'unknown'}`);
  }

  async sampleGeoJSON(url, resource = {}, options = {}) {
    const text = await this._fetchText(url, options);
    const geojson = JSON.parse(text);
    const normalized = GeoJSONConnector.normalizeGeoJSON(url, geojson);
    const geoFeatures = (normalized.metadata.geoFeatures || []).slice(0, this.config.maxFeatures);

    return {
      status: geoFeatures.length > 0 ? 'sampled' : 'needs-review',
      format: 'geojson',
      title: resource.label || normalized.title || titleFromUrl(url),
      url,
      featureCount: normalized.featureCount || geoFeatures.length,
      sampledFeatureCount: geoFeatures.length,
      truncated: Boolean(normalized.truncated || (normalized.featureCount || 0) > geoFeatures.length),
      geometryTypes: normalized.metadata.geometryTypes || [],
      spatialCoverage: normalized.metadata.spatialCoverage || bboxFromFeatures(geoFeatures),
      geoFeatures,
      diagnostics: {
        sourceContract: 'GeoJSONConnector.normalizeGeoJSON'
      }
    };
  }

  async sampleCsv(url, resource = {}, options = {}) {
    const text = await this._fetchText(url, options);
    const parsed = parseCsv(text, this.config.maxCsvRows);
    const coordinateFields = detectCoordinateFields(parsed.headers);
    if (!coordinateFields) {
      return {
        status: 'needs-review',
        format: 'csv',
        title: resource.label || titleFromUrl(url),
        url,
        featureCount: 0,
        sampledFeatureCount: 0,
        geoFeatures: [],
        diagnostics: {
          warning: 'CSV did not expose recognizable latitude/longitude columns.',
          headers: parsed.headers.slice(0, 20)
        }
      };
    }

    const geoFeatures = [];
    for (const [index, row] of parsed.rows.entries()) {
      const rawLon = row[coordinateFields.lon];
      const rawLat = row[coordinateFields.lat];
      if (String(rawLon ?? '').trim() === '' || String(rawLat ?? '').trim() === '') continue;
      const lon = Number(rawLon);
      const lat = Number(rawLat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      geoFeatures.push(normalizeSampledFeature({
        id: row.id || row.ID || row.code || row.Code || `csv-row-${index + 1}`,
        name: row.name || row.Name || row.place || row.Place || row.title || row.Title || `CSV feature ${index + 1}`,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: summarizeProperties(row),
        sourceUrl: url,
        confidence: 0.84
      }));
      if (geoFeatures.length >= this.config.maxFeatures) break;
    }

    return {
      status: geoFeatures.length > 0 ? 'sampled' : 'needs-review',
      format: 'csv',
      title: resource.label || titleFromUrl(url),
      url,
      featureCount: parsed.rows.length,
      sampledFeatureCount: geoFeatures.length,
      truncated: parsed.truncated || geoFeatures.length < parsed.rows.length,
      geometryTypes: geoFeatures.length > 0 ? ['Point'] : [],
      spatialCoverage: bboxFromFeatures(geoFeatures),
      coordinateFields,
      geoFeatures,
      diagnostics: {
        headers: parsed.headers.slice(0, 20)
      }
    };
  }

  async sampleShapefileZip(url, resource = {}, options = {}) {
    const buffer = await this._fetchBuffer(url, options);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const shpEntry = entries.find(entry => /\.shp$/i.test(entry.entryName) && !entry.isDirectory);
    const dbfEntry = entries.find(entry => /\.dbf$/i.test(entry.entryName) && !entry.isDirectory);
    if (!shpEntry) throw new Error('Shapefile zip did not contain a .shp member');

    const shp = bufferToArrayBuffer(shpEntry.getData());
    const dbf = dbfEntry ? bufferToArrayBuffer(dbfEntry.getData()) : undefined;
    const source = await shapefile.open(shp, dbf);
    const geoFeatures = [];
    let fullCount = 0;

    while (true) {
      const item = await source.read();
      if (item.done) break;
      fullCount += 1;
      if (geoFeatures.length < this.config.maxFeatures) {
        geoFeatures.push(normalizeSampledFeature({
          id: item.value.id || item.value.properties?.id || item.value.properties?.ID || `shape-${fullCount}`,
          name: readFeatureName(item.value.properties, `Shape feature ${fullCount}`),
          geometry: item.value.geometry,
          properties: summarizeProperties(item.value.properties || {}),
          sourceUrl: url,
          confidence: 0.86
        }));
      }
    }

    return {
      status: geoFeatures.length > 0 ? 'sampled' : 'needs-review',
      format: 'shapefile',
      title: resource.label || titleFromUrl(url),
      url,
      featureCount: fullCount,
      sampledFeatureCount: geoFeatures.length,
      truncated: fullCount > geoFeatures.length,
      geometryTypes: Array.from(new Set(geoFeatures.map(feature => feature.geometry?.type).filter(Boolean))),
      spatialCoverage: bboxFromFeatures(geoFeatures),
      geoFeatures,
      diagnostics: {
        shpEntry: shpEntry.entryName,
        dbfEntry: dbfEntry?.entryName || null
      }
    };
  }

  async sampleGeoTiff(url, resource = {}, options = {}) {
    const buffer = await this._fetchBuffer(url, options);
    const tiff = await GeoTIFF.fromArrayBuffer(bufferToArrayBuffer(buffer));
    const image = await tiff.getImage();
    const bbox = safeCall(() => image.getBoundingBox()) || null;
    const fileDirectory = image.getFileDirectory ? image.getFileDirectory() : {};
    const width = image.getWidth();
    const height = image.getHeight();
    const samplesPerPixel = image.getSamplesPerPixel ? image.getSamplesPerPixel() : null;

    return {
      status: bbox ? 'metadata-sampled' : 'needs-review',
      format: 'geotiff',
      title: resource.label || titleFromUrl(url),
      url,
      featureCount: 1,
      sampledFeatureCount: 0,
      truncated: false,
      geometryTypes: bbox ? ['Bbox'] : [],
      spatialCoverage: normalizeBbox(bbox),
      geoFeatures: [],
      rasterMetadata: {
        width,
        height,
        samplesPerPixel,
        bbox: normalizeBbox(bbox),
        bitsPerSample: fileDirectory.BitsPerSample || null,
        sampleFormat: fileDirectory.SampleFormat || null,
        modelPixelScale: fileDirectory.ModelPixelScale || null,
        modelTiepoint: fileDirectory.ModelTiepoint || null
      },
      diagnostics: {
        warning: bbox ? null : 'GeoTIFF metadata did not expose a direct geographic bounding box.'
      }
    };
  }

  async _fetchText(url, options = {}) {
    const response = await this._fetch(url, options);
    const length = Number(response.headers.get('content-length') || 0);
    if (length && length > this.config.maxTextBytes) {
      throw new Error(`Resource is too large for bounded text sampling: ${length} bytes`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > this.config.maxTextBytes) {
      throw new Error('Resource exceeded bounded text sampling limit');
    }
    return text;
  }

  async _fetchBuffer(url, options = {}) {
    const response = await this._fetch(url, options);
    const length = Number(response.headers.get('content-length') || 0);
    if (length && length > this.config.maxBytes) {
      throw new Error(`Resource is too large for bounded spatial sampling: ${length} bytes`);
    }
    const buffer = await response.buffer();
    if (buffer.length > this.config.maxBytes) {
      throw new Error('Resource exceeded bounded spatial sampling limit');
    }
    return buffer;
  }

  async _fetch(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        Accept: options.accept || '*/*',
        'User-Agent': 'Teruvion/0.12.85 (https://teruvion.com)'
      },
      signal: AbortSignal.timeout(options.timeout || this.config.timeout || 20000)
    });
    if (!response.ok) throw new Error(`Spatial resource fetch failed: ${response.status}`);
    return response;
  }
}

function normalizeSampledFeature({ id, name, geometry, properties, sourceUrl, confidence }) {
  const bbox = bboxFromGeometry(geometry);
  return {
    id: String(id || name || 'spatial-feature'),
    name: String(name || id || 'Spatial feature'),
    type: geometryKind(geometry) === 'point' ? 'Observation' : 'Region',
    geometry,
    bbox,
    displayPrimitive: primitiveFromGeometry(geometry),
    geometryKind: geometryKind(geometry),
    sourceUrl,
    properties: summarizeProperties(properties || {}),
    confidence,
    originalText: String(name || id || 'Spatial feature')
  };
}

function parseCsv(text, maxRows) {
  const rows = [];
  let current = [];
  let value = '';
  let inQuotes = false;
  const pushValue = () => {
    current.push(value);
    value = '';
  };
  const pushRow = () => {
    if (current.length === 1 && current[0] === '') {
      current = [];
      return;
    }
    rows.push(current);
    current = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      pushValue();
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      pushValue();
      pushRow();
      if (rows.length > maxRows + 1) break;
      continue;
    }
    value += char;
  }
  if (value || current.length > 0) {
    pushValue();
    pushRow();
  }

  const headers = (rows.shift() || []).map(header => String(header || '').trim());
  const objects = rows.slice(0, maxRows).map(row => {
    const object = {};
    headers.forEach((header, index) => {
      if (!header) return;
      object[header] = row[index] !== undefined ? row[index] : '';
    });
    return object;
  });
  return {
    headers,
    rows: objects,
    truncated: rows.length > maxRows
  };
}

function detectCoordinateFields(headers = []) {
  const profiles = headers.map(header => ({
    original: header,
    normalized: String(header || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  }));
  const lon = profiles.find(field => ['longitude', 'long', 'lon', 'lng', 'xcoord', 'xcoordinate'].includes(field.normalized));
  const lat = profiles.find(field => ['latitude', 'lat', 'ycoord', 'ycoordinate'].includes(field.normalized));
  return lon && lat ? { lon: lon.original, lat: lat.original } : null;
}

function summarizeProperties(properties = {}) {
  const output = {};
  for (const [key, value] of Object.entries(properties).slice(0, 18)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      const primitiveValues = value.filter(item => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 80);
      if (primitiveValues.length > 0) output[key] = primitiveValues;
      continue;
    }
    if (typeof value === 'object') continue;
    const numeric = typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : value;
    output[key] = numeric;
  }
  return output;
}

function readFeatureName(properties = {}, fallback) {
  for (const key of ['name', 'Name', 'NAME', 'title', 'Title', 'TITLE', 'place', 'Place', 'id', 'ID']) {
    if (properties[key]) return String(properties[key]);
  }
  return fallback;
}

function bboxFromFeatures(features = []) {
  const boxes = features.map(feature => feature.bbox || bboxFromGeometry(feature.geometry)).filter(Boolean);
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
  const lons = coordinates.map(point => Number(point[0])).filter(Number.isFinite);
  const lats = coordinates.map(point => Number(point[1])).filter(Number.isFinite);
  if (lons.length === 0 || lats.length === 0) return null;
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function collectCoordinates(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];
  if (geometry.type === 'Point') return [geometry.coordinates].filter(isCoordinate);
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') return geometry.coordinates.filter(isCoordinate);
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates.flat().filter(isCoordinate);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2).filter(isCoordinate);
  return [];
}

function isCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function normalizeBbox(value) {
  if (!Array.isArray(value) || value.length < 4) return null;
  const bbox = value.slice(0, 4).map(Number);
  return bbox.every(Number.isFinite) ? bbox : null;
}

function normalizeFormat(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'tif' || normalized === 'tiff') return 'geotiff';
  if (normalized === 'zip') return 'shapefile';
  if (normalized === 'json') return 'geojson';
  return normalized;
}

function isLikelyGeoJSONUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.geojson') || pathname.includes('geojson');
  } catch {
    return false;
  }
}

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function titleFromUrl(url) {
  try {
    const filename = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    return filename.replace(/\.(csv|zip|shp|tiff?|geojson|json)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Spatial resource';
  } catch {
    return 'Spatial resource';
  }
}

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

module.exports = SpatialResourceSampler;
module.exports.parseCsv = parseCsv;
module.exports.detectCoordinateFields = detectCoordinateFields;
