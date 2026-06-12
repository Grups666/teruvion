/**
 * Map Lens
 * Spatial view of research regions, data coverage, and Earth objects
 *
 * Supports Five-Layer Ontology:
 * - Layer 3: World objects (Basin, Region, Glacier, Lake, etc.)
 * - Layer 2: Observation entities (Gauge, Station, Satellite coverage)
 * - Layer 2: Data entities (Dataset coverage)
 */

const Lens = require('./Lens');

const SPATIAL_ENTITY_LAYERS = new Set(['world', 'capability', 'domain', 'extension']);

class MapLens extends Lens {
  getName() {
    return 'map';
  }

  getDescription() {
    return 'Spatial view of objects with geometry, bbox, point, or coverage metadata';
  }

  getRelevantEntityTypes() {
    return Object.entries(this.ontology.ENTITY_SCHEMAS || {})
      .filter(([_, schema]) => SPATIAL_ENTITY_LAYERS.has(schema.layer))
      .map(([type]) => type);
  }

  getRelevantRelationTypes() {
    return ['studies', 'covers', 'contains', 'adjacent_to', 'located_at', 'drains_to', 'upstream_of', 'downstream_of', 'observes', 'measures'];
  }

  async render(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const features = [];
    const regions = [];

    for (const entity of entities) {
      const feature = this._entityToFeature(entity);
      if (!feature) continue;

      features.push(feature);

      if (this._getLayer(entity.type) === 'world') {
        regions.push({
          id: entity.id,
          name: entity.getDisplayName(),
          type: entity.type,
          layer: this._getLayer(entity.type),
          category: this._categorizeType(entity.type),
          bbox: entity.attributes.bbox || this._bboxFromGeometry(feature.geometry),
          coverage: this._getCoverage(entity, entities)
        });
      }
    }

    // Calculate map bounds
    const bounds = this._calculateBounds(features);

    return {
      type: 'FeatureCollection',
      features,
      regions,
      bounds,
      metadata: this.generateMetadata(projectId, {
        totalFeatures: features.length,
        totalRegions: regions.length,
        hasSpatialWorldObjects: regions.length > 0,
        hasCapabilityCoverage: features.some(f => f.properties?.layer === 'capability'),
        hasHazardFeatures: features.some(f => f.properties?.category === 'hazard'),
        layers: this._countByLayer(features)
      })
    };
  }

  _entityToFeature(entity) {
    const geoGeometry = this._resolveGeometry(entity);
    if (!geoGeometry) return null;

    return {
      type: 'Feature',
      id: entity.id,
      geometry: geoGeometry,
      properties: {
        id: entity.id,
        name: entity.getDisplayName(),
        type: entity.type,
        layer: this._getLayer(entity.type),
        category: this._categorizeType(entity.type),
        description: entity.attributes.description || '',
        verificationState: entity.verificationState
      }
    };
  }

  _resolveGeometry(entity) {
    const attributes = entity.attributes || {};
    if (attributes.geometry) return attributes.geometry;

    if (Array.isArray(attributes.bbox) && attributes.bbox.length >= 4) {
      return this._bboxToPolygon(attributes.bbox);
    }

    if (attributes.centroid) {
      return this._pointGeometry(attributes.centroid);
    }

    if (attributes.location) {
      return this._pointGeometry(attributes.location);
    }

    const coverage = attributes.spatialCoverage;
    if (Array.isArray(coverage) && coverage.length >= 4) {
      return this._bboxToPolygon(coverage);
    }

    if (typeof coverage === 'string' && coverage.toLowerCase() === 'global') {
      return this._bboxToPolygon([-180, -90, 180, 90]);
    }

    return null;
  }

  _bboxToPolygon(bbox) {
    return {
      type: 'Polygon',
      coordinates: [[
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[2], bbox[3]],
        [bbox[0], bbox[3]],
        [bbox[0], bbox[1]]
      ]]
    };
  }

  _pointGeometry(value) {
    const coordinates = Array.isArray(value) ? value : value.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    return {
      type: 'Point',
      coordinates
    };
  }

  _getCoverage(entity, allEntities) {
    // Find datasets covering this region
    const datasets = [];
    for (const e of allEntities) {
      const relations = this.store.getRelations(e.id);
      const coversThis = relations.outgoing.some(r =>
        r.predicate === 'covers' && r.object === entity.id
      );
      if (coversThis) {
        datasets.push(e.getDisplayName());
      }
    }
    return datasets;
  }

  _bboxFromGeometry(geometry) {
    if (!geometry) return null;
    const coords = this._extractCoords(geometry);
    if (coords.length === 0) return null;

    let minLng = Infinity, minLat = Infinity;
    let maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    return [minLng, minLat, maxLng, maxLat];
  }

  _calculateBounds(features) {
    if (features.length === 0) return null;

    let minLng = Infinity, minLat = Infinity;
    let maxLng = -Infinity, maxLat = -Infinity;

    for (const feature of features) {
      if (!feature.geometry) continue;

      const coords = this._extractCoords(feature.geometry);
      for (const [lng, lat] of coords) {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }

    return [minLng, minLat, maxLng, maxLat];
  }

  _extractCoords(geometry) {
    const coords = [];

    if (geometry.type === 'Point') {
      coords.push(geometry.coordinates);
    } else if (geometry.type === 'Polygon') {
      coords.push(...geometry.coordinates[0]);
    } else if (geometry.type === 'MultiPolygon') {
      for (const poly of geometry.coordinates) {
        coords.push(...poly[0]);
      }
    } else if (geometry.type === 'LineString') {
      coords.push(...geometry.coordinates);
    }

    return coords;
  }

  /**
   * Count features by layer
   */
  _countByLayer(features) {
    const counts = {};
    for (const f of features) {
      const layer = f.properties?.layer || 'unknown';
      counts[layer] = (counts[layer] || 0) + 1;
    }
    return counts;
  }
}

module.exports = MapLens;
