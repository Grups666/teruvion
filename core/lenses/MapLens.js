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

class MapLens extends Lens {
  getName() {
    return 'map';
  }

  getDescription() {
    return 'Spatial view of Earth objects, regions, basins, and data coverage';
  }

  getRelevantEntityTypes() {
    // World Layer - Earth Objects
    const earthObjects = ['Region', 'Location', 'Basin', 'Watershed', 'Glacier', 'Lake', 'Aquifer', 'Coastline', 'River'];

    // Capability Layer - Observation
    const observation = ['Gauge', 'Station', 'Sensor', 'Satellite'];

    // Capability Layer - Data
    const data = ['Dataset', 'Coverage'];

    // World Layer - Hazards
    const hazards = ['FloodEvent', 'DroughtEvent', 'Wildfire', 'Landslide'];

    return [...earthObjects, ...observation, ...data, ...hazards];
  }

  getRelevantRelationTypes() {
    return ['studies', 'covers', 'contains', 'adjacent_to', 'located_at', 'drains_to', 'upstream_of', 'downstream_of', 'observes', 'measures'];
  }

  async render(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const features = [];
    const regions = [];

    for (const entity of entities) {
      // Handle spatial entities (World Layer - Earth Objects)
      if (this._isSpatialEntity(entity)) {
        const feature = this._entityToFeature(entity);
        if (feature) {
          features.push(feature);
          regions.push({
            id: entity.id,
            name: entity.getDisplayName(),
            type: entity.type,
            layer: this._getLayer(entity.type),
            bbox: entity.attributes.bbox,
            coverage: this._getCoverage(entity, entities)
          });
        }
      }

      // Handle Dataset with spatial coverage (Capability Layer - Data)
      if (entity.type === 'Dataset' && entity.attributes.spatialCoverage) {
        const dsFeature = this._datasetToFeature(entity);
        if (dsFeature) {
          features.push(dsFeature);
        }
      }

      // Handle Observation entities (Capability Layer - Observation)
      if (this._isObservationEntity(entity)) {
        const obsFeature = this._observationToFeature(entity);
        if (obsFeature) {
          features.push(obsFeature);
        }
      }

      // Handle Hazard entities (World Layer - Hazards)
      if (this._isHazardEntity(entity)) {
        const hazardFeature = this._hazardToFeature(entity);
        if (hazardFeature) {
          features.push(hazardFeature);
        }
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
        hasGauges: entities.some(e => e.type === 'Gauge'),
        hasBasins: entities.some(e => ['Basin', 'Watershed'].includes(e.type)),
        hasHazards: entities.some(e => this._isHazardEntity(e)),
        layers: this._countByLayer(features)
      })
    };
  }

  _isSpatialEntity(entity) {
    return ['Region', 'Location', 'Basin', 'Watershed', 'Glacier', 'Lake', 'Aquifer', 'Coastline', 'River'].includes(entity.type);
  }

  _isObservationEntity(entity) {
    return ['Gauge', 'Station', 'Sensor'].includes(entity.type);
  }

  _isHazardEntity(entity) {
    return ['FloodEvent', 'DroughtEvent', 'Wildfire', 'Landslide', 'Heatwave', 'Hazard'].includes(entity.type);
  }

  _observationToFeature(entity) {
    const location = entity.attributes.location || entity.attributes.centroid;
    if (!location) return null;

    const coords = Array.isArray(location) ? location : location.coordinates;

    return {
      type: 'Feature',
      id: entity.id,
      geometry: {
        type: 'Point',
        coordinates: coords
      },
      properties: {
        id: entity.id,
        name: entity.getDisplayName(),
        type: entity.type,
        layer: 'capability',
        category: 'observation',
        stationId: entity.attributes.stationId,
        river: entity.attributes.river,
        verificationState: entity.verificationState
      }
    };
  }

  _hazardToFeature(entity) {
    const location = entity.attributes.location || entity.attributes.centroid;
    const bbox = entity.attributes.bbox;

    let geometry = null;

    if (bbox && bbox.length >= 4) {
      geometry = {
        type: 'Polygon',
        coordinates: [[
          [bbox[0], bbox[1]],
          [bbox[2], bbox[1]],
          [bbox[2], bbox[3]],
          [bbox[0], bbox[3]],
          [bbox[0], bbox[1]]
        ]]
      };
    } else if (location) {
      const coords = Array.isArray(location) ? location : location.coordinates;
      geometry = {
        type: 'Point',
        coordinates: coords
      };
    } else {
      return null;
    }

    return {
      type: 'Feature',
      id: entity.id,
      geometry,
      properties: {
        id: entity.id,
        name: entity.getDisplayName(),
        type: entity.type,
        layer: 'world',
        category: 'hazard',
        magnitude: entity.attributes.magnitude,
        severity: entity.attributes.severity,
        date: entity.attributes.date,
        verificationState: entity.verificationState
      }
    };
  }

  _entityToFeature(entity) {
    const bbox = entity.attributes.bbox;
    const geometry = entity.attributes.geometry;

    let geoGeometry = null;

    if (geometry) {
      geoGeometry = geometry;
    } else if (bbox && bbox.length >= 4) {
      // Convert bbox to Polygon
      geoGeometry = {
        type: 'Polygon',
        coordinates: [[
          [bbox[0], bbox[1]],
          [bbox[2], bbox[1]],
          [bbox[2], bbox[3]],
          [bbox[0], bbox[3]],
          [bbox[0], bbox[1]]
        ]]
      };
    } else if (entity.attributes.centroid) {
      geoGeometry = {
        type: 'Point',
        coordinates: entity.attributes.centroid
      };
    } else {
      return null;
    }

    return {
      type: 'Feature',
      id: entity.id,
      geometry: geoGeometry,
      properties: {
        id: entity.id,
        name: entity.getDisplayName(),
        type: entity.type,
        layer: 'world',
        category: this._categorizeType(entity.type),
        description: entity.attributes.description || '',
        verificationState: entity.verificationState,
        // Type-specific properties
        ...(entity.type === 'Basin' ? {
          area: entity.attributes.area,
          mainRiver: entity.attributes.mainRiver
        } : {}),
        ...(entity.type === 'Watershed' ? {
          area: entity.attributes.area
        } : {}),
        ...(entity.type === 'Glacier' ? {
          area: entity.attributes.area,
          iceVolume: entity.attributes.iceVolume
        } : {}),
        ...(entity.type === 'Lake' ? {
          area: entity.attributes.area,
          depth: entity.attributes.depth
        } : {}),
        ...(entity.type === 'River' ? {
          length: entity.attributes.length,
          basin: entity.attributes.basin
        } : {})
      }
    };
  }

  _datasetToFeature(entity) {
    const coverage = entity.attributes.spatialCoverage;

    if (!coverage) return null;

    // Handle string coverage like "global"
    if (typeof coverage === 'string') {
      if (coverage.toLowerCase() === 'global') {
        return {
          type: 'Feature',
          id: entity.id,
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
            ]]
          },
          properties: {
            id: entity.id,
            name: entity.getDisplayName(),
            type: 'Dataset',
            coverage: coverage,
            isGlobal: true
          }
        };
      }
      return null;
    }

    // Handle bbox coverage
    if (Array.isArray(coverage) && coverage.length >= 4) {
      return {
        type: 'Feature',
        id: entity.id,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [coverage[0], coverage[1]],
            [coverage[2], coverage[1]],
            [coverage[2], coverage[3]],
            [coverage[0], coverage[3]],
            [coverage[0], coverage[1]]
          ]]
        },
        properties: {
          id: entity.id,
          name: entity.getDisplayName(),
          type: 'Dataset',
          resolution: entity.attributes.spatialResolution
        }
      };
    }

    return null;
  }

  _getCoverage(entity, allEntities) {
    // Find datasets covering this region
    const datasets = [];
    for (const e of allEntities) {
      if (e.type === 'Dataset') {
        const relations = this.store.getRelations(e.id);
        const coversThis = relations.outgoing.some(r =>
          r.predicate === 'covers' && r.object === entity.id
        );
        if (coversThis) {
          datasets.push(e.getDisplayName());
        }
      }
    }
    return datasets;
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