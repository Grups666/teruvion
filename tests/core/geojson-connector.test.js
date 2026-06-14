/**
 * GeoJSONConnector tests
 */

const assert = require('assert');
const { describe, it } = require('../setup');
const GeoJSONConnector = require('../../core/connectors/GeoJSONConnector');
const ConnectorRegistry = require('../../core/connectors/ConnectorRegistry');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');
const { buildMapRecomposition } = require('../../core/project/MapRecomposer');

describe('GeoJSONConnector', () => {
  it('normalizes point, region, and route features into a source contract', () => {
    const normalized = GeoJSONConnector.normalizeGeoJSON('https://example.org/sample.geojson', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Observation point', magnitude: 2.1 },
          geometry: { type: 'Point', coordinates: [10, 20] }
        },
        {
          type: 'Feature',
          properties: { name: 'Study boundary' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0]
            ]]
          }
        },
        {
          type: 'Feature',
          properties: { name: 'Track segment' },
          geometry: {
            type: 'LineString',
            coordinates: [[30, 1], [31, 2]]
          }
        }
      ]
    });

    assert.strictEqual(normalized.metadata.type, 'DatasetPage');
    assert.strictEqual(normalized.metadata.format, 'geojson');
    assert.deepStrictEqual(
      normalized.metadata.geoFeatures.map(feature => feature.displayPrimitive),
      ['point-layer', 'region-layer', 'route-or-flow-layer']
    );
    assert.ok(normalized.metadata.spatialCoverage, 'Should expose aggregate bbox');
    assert.strictEqual(normalized.metadata.datasets[0].featureCount, 3);
  });

  it('is routed before paper handling for GeoJSON URLs', () => {
    const registry = new ConnectorRegistry();
    const connector = registry.findConnector('https://example.org/data/sample.geojson');

    assert.ok(connector instanceof GeoJSONConnector);
  });

  it('preserves connector-provided geo features through decomposition and map recomposition', async () => {
    const normalized = GeoJSONConnector.normalizeGeoJSON('https://example.org/sample.geojson', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Observation point' },
          geometry: { type: 'Point', coordinates: [10, 20] }
        },
        {
          type: 'Feature',
          properties: { name: 'Study boundary' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]
          }
        }
      ]
    });
    const content = {
      type: 'geojson',
      content: normalized.content,
      metadata: normalized.metadata
    };
    const admission = new SourceAdmission(null, { useLLMTransferAssessment: false });
    const admissionResult = await admission.evaluate('https://example.org/sample.geojson', content, {});
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const decomposition = await decomposer.decompose('https://example.org/sample.geojson', content, admissionResult);
    const map = buildMapRecomposition({ decomposition, admission: admissionResult });
    const primitives = new Set(map.map.layers.map(layer => layer.displayPrimitive));

    assert.ok(decomposition.worldObjects.length >= 2, 'GeoJSON features should become spatial objects');
    assert.ok(primitives.has('point-layer'), 'Point features should be map-ready');
    assert.ok(primitives.has('region-layer'), 'Region features should be map-ready');
    assert.strictEqual(map.map.diagnostics.status, 'ready');
  });
});
