/**
 * NamedLocationResolver
 *
 * Bounded geocoding for source-extracted named places. It only resolves names
 * that already exist in the source-derived object graph and records provenance.
 */

const fetch = require('node-fetch');

const DEFAULTS = Object.freeze({
  maxLocations: 4,
  timeout: 10000
});

class NamedLocationResolver {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...config, ...(config.namedLocationResolver || {}) };
    this.fetch = config.fetch || fetch;
  }

  canResolve(object = {}) {
    const attrs = object.attributes || {};
    if (attrs.geometry || attrs.bbox || Array.isArray(attrs.coordinates)) return false;
    const name = candidateLocationName(object);
    if (!name || isGlobalScope(name)) return false;
    return name.length >= 3 && name.length <= 160;
  }

  async resolve(object = {}, options = {}) {
    const query = candidateLocationName(object);
    if (!query) return null;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await this.fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Teruvion/0.12.86 (https://teruvion.com)'
      },
      signal: AbortSignal.timeout(options.timeout || this.config.timeout)
    });
    if (!response.ok) throw new Error(`Geocoding failed: HTTP ${response.status}`);
    const data = await response.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;
    const lon = Number(first.lon);
    const lat = Number(first.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const bbox = Array.isArray(first.boundingbox) && first.boundingbox.length >= 4
      ? [
          Number(first.boundingbox[2]),
          Number(first.boundingbox[0]),
          Number(first.boundingbox[3]),
          Number(first.boundingbox[1])
        ]
      : null;
    return {
      query,
      displayName: first.display_name || query,
      coordinates: [lon, lat],
      bbox: bbox && bbox.every(Number.isFinite) ? bbox : null,
      confidence: confidenceFromResult(first),
      provider: 'nominatim',
      rawType: first.type || null,
      rawClass: first.class || null
    };
  }
}

function candidateLocationName(object = {}) {
  const attrs = object.attributes || {};
  const values = [
    attrs.locationName,
    attrs.location,
    attrs.place,
    attrs.city,
    attrs.region,
    attrs.country,
    attrs.spatialCoverage,
    attrs.spatialExtent,
    object.location,
    object.name
  ];
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && typeof value.name === 'string') return value.name.trim();
  }
  return '';
}

function isGlobalScope(value = '') {
  return /^(global|world|earth|worldwide|global scope|global view)$/i.test(String(value || '').trim());
}

function confidenceFromResult(result = {}) {
  const importance = Number(result.importance);
  if (Number.isFinite(importance)) return Math.max(0.45, Math.min(0.9, 0.45 + importance * 0.4));
  return 0.62;
}

module.exports = NamedLocationResolver;
module.exports.candidateLocationName = candidateLocationName;
