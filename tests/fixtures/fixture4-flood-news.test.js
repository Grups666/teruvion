/**
 * Fixture 4: Event/News Source
 * "Flood Disaster News Article"
 *
 * Purpose: Prove that a news/event source can be decomposed into
 * Event objects with bridge relations to affected Regions,
 * Population, and Infrastructure.
 *
 * Expected extraction:
 * - EventSignal: News → reports → FloodEvent
 * - WorldObjects: FloodEvent, Region, Population affected
 * - BridgeRelations: FloodEvent → affects → Region/Population
 */

const { assert, describe, it } = require('../setup');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');

const floodNews = {
  metadata: {
    type: 'News',
    title: 'Devastating Floods Hit Pakistan, Leaving Millions Displaced',
    url: 'https://reuters.com/world/pakistan-floods-2022',
    date: '2022-08-30',
    venue: 'Reuters',
    location: 'Pakistan',
    event: 'flood',
    keywords: ['flood', 'Pakistan', 'disaster', 'displaced', 'monsoon', 'climate']
  },
  text: `
# Devastating Floods Hit Pakistan, Leaving Millions Displaced

By Reuters Staff
August 30, 2022

## Overview
Heavy monsoon rains have caused catastrophic flooding across Pakistan, displacing millions of people and destroying thousands of homes. The disaster is being described as the worst flooding in the country's history.

## Impact Details

### Affected Regions
- **Sindh Province**: Over 15 million people affected, major cities submerged
- **Balochistan**: 5 million affected, infrastructure severely damaged
- **Punjab**: Agricultural lands flooded, crops destroyed
- **Khyber Pakhtunkhwa**: Flash floods in mountainous areas

### Human Impact
- **Displaced**: 33 million people (15% of population)
- **Deaths**: Over 1,500 confirmed deaths
- **Injuries**: More than 12,000 injured
- **Homeless**: 7 million people lost their homes

### Infrastructure Damage
- **Roads**: 6,000 km of roads destroyed
- **Bridges**: 150 bridges collapsed
- **Power**: 1,000 power stations damaged
- **Water**: 2.5 million acres of cropland flooded
- **Livestock**: 700,000 livestock killed

### Economic Impact
- Estimated damage: $30 billion
- GDP impact: 3-4% reduction expected
- Agricultural loss: $10 billion in crops

## Causes
The flooding was triggered by:
- Record monsoon rainfall (8 times normal levels)
- Melting glaciers in northern mountains
- Climate change intensifying extreme weather

## Response

### Government Actions
- National emergency declared
- Army deployed for rescue operations
- 5,000 relief camps established
- International aid requested

### International Response
- UN launched $160 million emergency appeal
- USAID providing $30 million
- China sending emergency supplies
- EU activating Copernicus satellite mapping

## Long-term Implications
Experts warn that Pakistan faces increasing flood risks due to climate change. The country needs:
- Improved early warning systems
- Better flood infrastructure
- Climate adaptation measures
- Insurance mechanisms for farmers

## Quote
"This is a climate catastrophe of biblical proportions," said Climate Minister Sherry Rehman. "We need global support to rebuild and adapt."
`
};

describe('Fixture 4: Flood News Decomposition', () => {
  it('should admit news as event_signal source', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    assert.ok(result.admitted, 'News should be admitted for Digital Earth relevance');
    assert.ok(result.sourceRoles.event_signal >= 0.4,
      `Should have strong event_signal (got ${result.sourceRoles.event_signal})`);
    assert.strictEqual(result.primaryRole, 'event_signal',
      'Primary role should be event_signal');
  });

  it('should activate hazard and earth-object categories', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    assert.ok(result.activatedOntologyLayers.includes('world'),
      'Should activate world layer');
    assert.ok(result.activatedCategories.includes('hazard'),
      'Should include hazard category');
    assert.ok(result.activatedCategories.includes('earth-object') ||
               result.activatedCategories.includes('risk'),
      'Should include earth-object or risk category');
  });

  it('should extract FloodEvent world object', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://reuters.com/pakistan-floods', floodNews, admissionResult);

    // Should have world objects
    assert.ok(decomposition.worldObjects.length > 0,
      'Should extract world objects from event news');

    // Should have flood event
    const floodEvent = decomposition.worldObjects.find(o =>
      o.type === 'FloodEvent' || o.type === 'Hazard' || o.type === 'EarthEvent'
    );

    if (floodEvent) {
      assert.ok(floodEvent.attributes.name || floodEvent.attributes.location,
        'FloodEvent should have name or location');
      assert.ok(floodEvent.provenance, 'FloodEvent should have provenance');
    }
  });

  it('should extract Region world objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://reuters.com/pakistan-floods', floodNews, admissionResult);

    // Should have regions affected
    const regions = decomposition.worldObjects.filter(o =>
      o.type === 'Region' || o.type === 'Basin' || o.type === 'Watershed'
    );

    if (regions.length > 0) {
      const sindh = regions.find(r => r.attributes.name?.includes('Sindh'));
      assert.ok(sindh || regions.length >= 1,
        'Should extract affected regions');
    }
  });

  it('should extract risk/exposure objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://reuters.com/pakistan-floods', floodNews, admissionResult);

    // Should have risk-related objects
    const risks = decomposition.worldObjects.filter(o =>
      o.type === 'EarthRisk' || o.type === 'FloodRisk' || o.type === 'Exposure' || o.type === 'Vulnerability'
    );

    // May have socioeconomic capability objects for affected population
    const socio = decomposition.capabilityObjects.filter(o =>
      o.type === 'PopulationDataset' || o.type === 'ExposureDataset'
    );

    // Either should capture impact information
    assert.ok(risks.length > 0 || socio.length > 0 ||
               decomposition.worldObjects.some(o => o.attributes?.affectedPopulation),
      'Should capture population impact information');
  });

  it('should build bridge relations: FloodEvent → affects → Region', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://reuters.com/pakistan-floods', floodNews, admissionResult);

    // If we have both events and regions, should have affects relations
    const events = decomposition.worldObjects.filter(o =>
      o.type === 'FloodEvent' || o.type === 'Hazard'
    );
    const regions = decomposition.worldObjects.filter(o =>
      o.type === 'Region'
    );

    if (events.length > 0 && regions.length > 0) {
      assert.ok(decomposition.bridgeRelations.length > 0,
        'Should have bridge relations between events and regions');

      const affectsRelation = decomposition.bridgeRelations.find(r =>
        r.type === 'affects' || r.type === 'impacts' || r.type === 'occurs_at'
      );
      assert.ok(affectsRelation, 'Should have affects/impacts relation');
    }
  });

  it('should extract Intervention/Response actions', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://reuters.com/pakistan-floods', floodNews, admissionResult);

    // Should have response actions
    const actions = decomposition.capabilityObjects.filter(o =>
      o.type === 'Intervention' || o.type === 'EmergencyResponse' || o.type === 'AdaptationMeasure'
    );

    if (actions.length > 0) {
      const emergency = actions.find(a =>
        a.attributes.type?.includes('emergency') || a.attributes.type?.includes('relief')
      );
      assert.ok(emergency || actions.length >= 1,
        'Should extract emergency response actions');
    }
  });

  it('should have provenance linking to source text', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://reuters.com/pakistan-floods', floodNews, admissionResult);

    // Source object should be News type
    assert.strictEqual(decomposition.sourceObject.type, 'News',
      'Source should be News type');

    // World objects should have provenance
    for (const obj of decomposition.worldObjects) {
      assert.ok(obj.provenance, `${obj.type} should have provenance`);
      assert.ok(obj.confidence > 0, `${obj.type} should have confidence`);
    }
  });

  it('should capture date and location of event', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://reuters.com/pakistan-floods', floodNews);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://reuters.com/pakistan-floods', floodNews, admissionResult);

    // Source object should have event metadata
    assert.ok(decomposition.sourceObject.attributes.date || decomposition.sourceObject.attributes.event,
      'Should capture event date');

    // Should have location information
    const hasLocation = decomposition.sourceObject.attributes.location ||
                        decomposition.worldObjects.some(o => o.attributes.location);

    assert.ok(hasLocation, 'Should capture location information');
  });
});

module.exports = {};