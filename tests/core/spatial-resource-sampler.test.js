/**
 * SpatialResourceSampler tests
 */

const assert = require('assert');
const { describe, it } = require('../setup');
const SpatialResourceSampler = require('../../core/connectors/SpatialResourceSampler');
const SpatialDataConnector = require('../../core/connectors/SpatialDataConnector');
const ConnectorRegistry = require('../../core/connectors/ConnectorRegistry');

describe('SpatialResourceSampler', () => {
  it('parses quoted CSV rows and detects coordinate fields generically', () => {
    const parsed = SpatialResourceSampler.parseCsv([
      'id,Latitude,Longitude,name,note',
      'a,10.5,20.5,"Alpha, site","quoted field"',
      'b,-1,30,Beta,plain'
    ].join('\n'), 10);
    const coordinateFields = SpatialResourceSampler.detectCoordinateFields(parsed.headers);

    assert.deepStrictEqual(coordinateFields, { lon: 'Longitude', lat: 'Latitude' });
    assert.strictEqual(parsed.rows.length, 2);
    assert.strictEqual(parsed.rows[0].name, 'Alpha, site');
  });

  it('normalizes CSV coordinate tables into bounded point features', async () => {
    const csv = [
      'id,lat,lon,name,value',
      'p1,10,20,Point One,4.2',
      'p2,11,21,Point Two,5.5',
      'p3,,22,Missing Lat,9'
    ].join('\n');
    const sampler = new SpatialResourceSampler({ maxFeatures: 10 });
    sampler._fetchText = async () => csv;

    const sample = await sampler.sample('https://example.org/points.csv', { format: 'csv' });

    assert.strictEqual(sample.status, 'sampled');
    assert.strictEqual(sample.sampledFeatureCount, 2);
    assert.deepStrictEqual(sample.spatialCoverage, [20, 10, 21, 11]);
    assert.deepStrictEqual(
      sample.geoFeatures.map(feature => feature.displayPrimitive),
      ['point-layer', 'point-layer']
    );
    assert.strictEqual(sample.geoFeatures[0].properties.value, 4.2);
  });

  it('normalizes direct spatial samples into a DatasetPage source contract', async () => {
    const connector = new SpatialDataConnector({
      spatialResourceSampler: {
        async sample() {
          return {
            status: 'sampled',
            format: 'csv',
            title: 'Point observations',
            featureCount: 2,
            sampledFeatureCount: 2,
            geometryTypes: ['Point'],
            spatialCoverage: [20, 10, 21, 11],
            geoFeatures: [{
              id: 'p1',
              name: 'Point One',
              type: 'Observation',
              geometry: { type: 'Point', coordinates: [20, 10] },
              bbox: [20, 10, 20, 10],
              displayPrimitive: 'point-layer',
              properties: { value: 4.2 }
            }]
          };
        }
      }
    });

    const content = await connector.fetch('https://example.org/points.csv');

    assert.strictEqual(content.type, 'spatial-data');
    assert.strictEqual(content.metadata.type, 'DatasetPage');
    assert.strictEqual(content.metadata.format, 'csv');
    assert.strictEqual(content.metadata.geoFeatures.length, 1);
    assert.strictEqual(content.metadata.resources[0].enrichment.source, 'direct-spatial-sample');
  });

  it('routes direct open spatial data before paper and generic URL handlers', () => {
    const registry = new ConnectorRegistry();

    assert.ok(registry.findConnector('https://example.org/points.csv') instanceof SpatialDataConnector);
    assert.ok(registry.findConnector('https://example.org/boundaries.zip') instanceof SpatialDataConnector);
    assert.ok(registry.findConnector('https://example.org/surface.tif') instanceof SpatialDataConnector);
    assert.ok(!(registry.findConnector('https://example.org/api/result.json') instanceof SpatialDataConnector));
  });
});
