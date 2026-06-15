/**
 * DigitalEarthDecomposer event-location fallback tests
 */

const { assert, describe, it } = require('../setup');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');

describe('DigitalEarthDecomposer event location fallback', () => {
  it('should create a reviewable map anchor from explicit event location text', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const content = {
      type: 'url',
      title: 'US: Flash Flooding Hits Streets of Lewistown as Storms Sweep Pennsylvania',
      metadata: {
        title: 'US: Flash Flooding Hits Streets of Lewistown as Storms Sweep Pennsylvania',
        description: 'Flooding hit the streets of Lewistown, Pennsylvania on Wednesday as severe thunderstorms swept through the region.',
        resources: []
      },
      content: [
        'US: Flash Flooding Hits Streets of Lewistown as Storms Sweep Pennsylvania',
        'Flooding hit the streets of Lewistown, Pennsylvania on Wednesday as severe thunderstorms swept through the region.'
      ].join('\n\n')
    };
    const admission = {
      sourceType: 'News',
      sourceRoles: {
        event_signal: 1,
        earth_content: 0.4
      },
      activatedCategories: ['hazard', 'earth-object'],
      transferReasons: [
        'The source reports flash flooding in Lewistown, Pennsylvania.'
      ]
    };

    const result = await decomposer.decompose('https://news.example/flood', content, admission);
    const event = result.worldObjects.find(object => object.type === 'Event');

    assert.ok(event, 'Should create an event object');
    assert.strictEqual(event.attributes.locationName, 'Lewistown, Pennsylvania');
    assert.strictEqual(event.attributes.displayPrimitive, 'point-layer');
    assert.strictEqual(event.metadata.reviewState, 'needs-review');
    assert.ok(result.provenance.sections.eventLocationFallback, 'Should expose fallback section metadata');
    assert.ok(
      event.provenance.note.includes('geocoding remains reviewable'),
      'Should keep the fallback visible and reviewable'
    );
  });
});
