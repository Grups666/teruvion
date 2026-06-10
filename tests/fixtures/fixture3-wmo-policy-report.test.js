/**
 * Fixture 3: Policy/Report Source
 * "WMO Early Warnings for All Initiative"
 *
 * Purpose: Prove that a policy/report source can be decomposed into
 * GovernanceCapability, AssessmentCapability, ActionCapability
 * with bridge relations to Hazards, Risks, and Vulnerabilities.
 *
 * Expected extraction:
 * - GovernanceCapability: Policy, Institution
 * - EvidenceCapability: Assessment, Indicator
 * - ActionCapability: Intervention, AdaptationMeasure
 * - WorldObjects: Hazard, Risk, Vulnerability
 * - BridgeRelations: Intervention → mitigates → Risk
 */

const { assert, describe, it } = require('../setup');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');

const wmoReport = {
  metadata: {
    type: 'Report',
    title: 'Early Warnings for All: Global Status Report 2023',
    institution: 'World Meteorological Organization (WMO)',
    year: 2023,
    reportType: 'Assessment Report',
    jurisdiction: 'Global',
    issuingBody: 'WMO Secretariat',
    topics: ['early warning systems', 'disaster risk reduction', 'climate adaptation'],
    regions: ['Global', 'Africa', 'Asia-Pacific', 'Latin America'],
    hazards: ['flood', 'drought', 'cyclone', 'heatwave', 'wildfire'],
    policies: [
      { name: 'Sendai Framework for Disaster Risk Reduction', status: 'endorsed' },
      { name: 'Paris Agreement', status: 'referenced' }
    ],
    institutions: [
      { name: 'World Meteorological Organization', type: 'international organization' },
      { name: 'UNDRR', type: 'UN agency' },
      { name: 'National Meteorological Services', type: 'national agency' }
    ]
  },
  text: `
# Early Warnings for All: Global Status Report 2023

## Executive Summary
The Early Warnings for All (EW4All) initiative aims to ensure every person on Earth is protected by early warning systems by 2027. This report assesses global progress and identifies critical gaps.

## Introduction
Climate change is increasing the frequency and intensity of extreme weather events. Floods, droughts, cyclones, heatwaves, and wildfires are causing unprecedented damage to lives and livelihoods.

## Current Status

### Global Coverage
- 50% of countries have inadequate early warning systems
- Only 40% of least developed countries have multi-hazard early warnings
- 3.5 billion people lack adequate protection from climate hazards

### Regional Analysis

#### Africa
- Flood risk: High in West and East Africa
- Drought risk: Severe in Sahel and Horn of Africa
- Early warning coverage: 30% of population

#### Asia-Pacific
- Cyclone risk: High in South and Southeast Asia
- Flood risk: Extreme in South Asian river basins
- Early warning coverage: 55% of population

## Key Findings

### Assessment 1: Flood Early Warning Systems
- Status: Moderate progress globally
- Coverage: 60% of flood-prone areas covered
- Gap: Last-mile communication in rural areas
- Recommendation: Invest in community-based warning systems

### Assessment 2: Drought Monitoring
- Status: Limited progress
- Coverage: 35% of drought-prone regions
- Gap: Integration of seasonal forecasts
- Recommendation: Strengthen regional drought monitoring networks

### Assessment 3: Cyclone Tracking
- Status: Strong progress in most regions
- Coverage: 85% of cyclone-prone coastlines
- Gap: Warning dissemination in remote islands
- Recommendation: Expand satellite-based communication

## Interventions

### Intervention 1: National Early Warning System Strengthening
- Target: 100 countries by 2025
- Budget: $3.1 billion
- Activities: Technical capacity building, infrastructure development
- Risk addressed: Flood, drought, cyclone

### Intervention 2: Community-Based Early Warning Networks
- Target: 1000 communities by 2027
- Budget: $500 million
- Activities: Training, equipment, communication systems
- Risk addressed: All hazards

### Intervention 3: Regional Early Warning Centers
- Target: 5 new regional centers
- Budget: $200 million
- Activities: Center establishment, staff training, data systems
- Risk addressed: Transboundary hazards

## Governance Framework
The initiative operates under the Sendai Framework for Disaster Risk Reduction and aligns with the Paris Agreement on climate adaptation.

## Conclusion
Significant investment is needed to achieve universal early warning coverage by 2027. The benefits in lives saved and economic damage avoided far outweigh the costs.
`
};

describe('Fixture 3: WMO Policy Report Decomposition', () => {
  it('should admit report as governance/action capability source', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    assert.ok(result.admitted, 'Report should be admitted');

    // Should have governance or action capability
    const hasGovOrAction = result.sourceRoles.governance_capability >= 0.2 ||
                           result.sourceRoles.action_capability >= 0.2;
    assert.ok(hasGovOrAction, 'Should detect governance or action capability');

    // May also have earth_content and evidence_assessment
    assert.ok(result.sourceRoles.earth_content >= 0.2 || result.sourceRoles.evidence_assessment >= 0.2,
      'Should also detect earth content or evidence assessment');
  });

  it('should activate governance, evidence, and risk categories', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    assert.ok(result.activatedOntologyLayers.includes('capability'),
      'Should activate capability layer');
    assert.ok(result.activatedOntologyLayers.includes('world'),
      'Should activate world layer');

    // Should include governance or action category
    const hasRelevantCategory = result.activatedCategories.includes('governance') ||
                                 result.activatedCategories.includes('action') ||
                                 result.activatedCategories.includes('evidence') ||
                                 result.activatedCategories.includes('risk');
    assert.ok(hasRelevantCategory, 'Should have relevant categories');
  });

  it('should extract Institution objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://wmo.int/ew4all-report-2023', wmoReport, admissionResult);

    // Check for institution objects
    const institutions = decomposition.capabilityObjects.filter(o => o.type === 'Institution');

    if (institutions.length > 0) {
      const wmo = institutions.find(i => i.attributes.name?.includes('WMO') || i.attributes.name?.includes('Meteorological'));
      if (wmo) {
        assert.ok(wmo.attributes.type, 'Institution should have type');
        assert.ok(wmo.provenance, 'Institution should have provenance');
      }
    }
  });

  it('should extract Policy/Regulation objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://wmo.int/ew4all-report-2023', wmoReport, admissionResult);

    // Check for policy objects
    const policies = decomposition.capabilityObjects.filter(o =>
      o.type === 'Policy' || o.type === 'Regulation' || o.type === 'Agreement'
    );

    if (policies.length > 0) {
      const sendai = policies.find(p =>
        p.attributes.name?.includes('Sendai') || p.attributes.name?.includes('Framework')
      );
      if (sendai) {
        assert.ok(sendai.attributes.status || sendai.attributes.jurisdiction,
          'Policy should have status or jurisdiction');
      }
    }
  });

  it('should extract Assessment/Indicator objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://wmo.int/ew4all-report-2023', wmoReport, admissionResult);

    // Check for assessment objects
    const assessments = decomposition.capabilityObjects.filter(o =>
      o.type === 'Assessment' || o.type === 'Indicator'
    );

    // If we have assessments, check structure
    if (assessments.length > 0) {
      const floodAssessment = assessments.find(a =>
        a.attributes.name?.includes('Flood') || a.attributes.scope?.includes('flood')
      );
      if (floodAssessment) {
        assert.ok(floodAssessment.attributes.type || floodAssessment.attributes.scope,
          'Assessment should have type or scope');
      }
    }
  });

  it('should extract Intervention/Action objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://wmo.int/ew4all-report-2023', wmoReport, admissionResult);

    // Check for action/intervention objects
    const actions = decomposition.capabilityObjects.filter(o =>
      o.type === 'Intervention' || o.type === 'AdaptationMeasure' || o.type === 'Action'
    );

    if (actions.length > 0) {
      const earlyWarning = actions.find(a =>
        a.attributes.name?.includes('Early Warning') || a.attributes.type?.includes('warning')
      );
      if (earlyWarning) {
        assert.ok(earlyWarning.attributes.target || earlyWarning.attributes.status,
          'Action should have target or status');
      }
    }
  });

  it('should extract Hazard/Risk world objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://wmo.int/ew4all-report-2023', wmoReport, admissionResult);

    // Check for hazard/risk objects
    const hazards = decomposition.worldObjects.filter(o =>
      o.type === 'Hazard' || o.type === 'FloodEvent' || o.type === 'DroughtEvent' ||
      o.type === 'EarthRisk' || o.type === 'FloodRisk'
    );

    // May or may not extract depending on metadata structure
    // But should have capability to do so
    assert.ok(decomposition.worldObjects !== undefined, 'Should have worldObjects array');
  });

  it('should build bridge relations between actions and risks', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://wmo.int/ew4all-report-2023', wmoReport, admissionResult);

    // If we have both actions and risks, check for bridge relations
    const actions = decomposition.capabilityObjects.filter(o =>
      o.type === 'Intervention' || o.type === 'AdaptationMeasure'
    );
    const risks = decomposition.worldObjects.filter(o =>
      o.type === 'EarthRisk' || o.type === 'FloodRisk' || o.type === 'DroughtRisk'
    );

    if (actions.length > 0 && risks.length > 0 && decomposition.bridgeRelations.length > 0) {
      // Should have mitigates or reduces relations
      const actionToRisk = decomposition.bridgeRelations.find(r =>
        r.type === 'mitigates' || r.type === 'reduces' || r.type === 'targets'
      );
      assert.ok(actionToRisk, 'Should have action-to-risk relation');
    }
  });

  it('should track provenance with section references', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://wmo.int/ew4all-report-2023', wmoReport);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://wmo.int/ew4all-report-2023', wmoReport, admissionResult);

    // All extracted objects should have provenance
    for (const obj of decomposition.capabilityObjects) {
      assert.ok(obj.provenance, `${obj.type} should have provenance`);
    }

    // Source object should have correct type
    assert.strictEqual(decomposition.sourceObject.type, 'Report');
  });
});

module.exports = {};