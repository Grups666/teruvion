/**
 * NamedLocationResolver tests
 */

const assert = require('assert');
const { describe, it } = require('../setup');
const NamedLocationResolver = require('../../core/connectors/NamedLocationResolver');

describe('NamedLocationResolver', () => {
  it('skips global scopes and already located objects', () => {
    const resolver = new NamedLocationResolver();

    assert.strictEqual(resolver.canResolve({ name: 'Global scope', attributes: { location: 'Global' } }), false);
    assert.strictEqual(resolver.canResolve({ name: 'Located event', attributes: { coordinates: [-86, 38] } }), false);
    assert.strictEqual(resolver.canResolve({ name: 'Flood event', attributes: { location: 'Corydon, Indiana' } }), true);
  });

  it('resolves named places into point geometry metadata', async () => {
    const resolver = new NamedLocationResolver({
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return [{
            lat: '38.2120',
            lon: '-86.1219',
            boundingbox: ['38.1', '38.3', '-86.3', '-86.0'],
            display_name: 'Corydon, Harrison County, Indiana, United States',
            importance: 0.5,
            type: 'town',
            class: 'place'
          }];
        }
      })
    });

    const resolved = await resolver.resolve({
      name: 'Flood event',
      attributes: {
        location: 'Corydon, Indiana'
      }
    });

    assert.deepStrictEqual(resolved.coordinates, [-86.1219, 38.2120]);
    assert.deepStrictEqual(resolved.bbox, [-86.3, 38.1, -86, 38.3]);
    assert.strictEqual(resolved.provider, 'nominatim');
    assert.ok(resolved.confidence >= 0.45);
  });
});
