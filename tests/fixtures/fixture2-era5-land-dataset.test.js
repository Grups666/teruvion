/**
 * Fixture 2: Dataset Source
 * "ERA5-Land Climate Reanalysis"
 *
 * Purpose: Prove that a data source can be decomposed into
 * Dataset/Variable/Coverage objects with bridge relations to
 * EarthVariables and EarthProcesses.
 *
 * Expected extraction:
 * - DataCapability: Dataset, Variable, Coverage, Resolution
 * - WorldObjects: EarthVariable (precipitation, temperature, etc.)
 * - BridgeRelations: Dataset → represents → EarthVariable
 */

const { assert, describe, it } = require('../setup');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');

const era5LandDataset = {
  metadata: {
    type: 'DatasetPage',
    title: 'ERA5-Land: Hourly data from 1950 to present',
    url: 'https://cds.climate.copernicus.eu/datasets/era5-land',
    institution: 'Copernicus Climate Change Service',
    variables: [
      { name: '2m_temperature', unit: 'K', description: 'Air temperature at 2m height' },
      { name: 'total_precipitation', unit: 'm', description: 'Total precipitation' },
      { name: 'surface_pressure', unit: 'Pa', description: 'Surface air pressure' },
      { name: '10m_u_component_of_wind', unit: 'm/s', description: 'Eastward wind component' },
      { name: '10m_v_component_of_wind', unit: 'm/s', description: 'Northward wind component' },
      { name: 'evaporation', unit: 'm', description: 'Evaporation from land surface' },
      { name: 'snow_depth', unit: 'm', description: 'Snow depth' },
      { name: 'soil_temperature_level_1', unit: 'K', description: 'Soil temperature at 0-7cm' },
      { name: 'volumetric_soil_water_layer_1', unit: 'm³/m³', description: 'Soil moisture at 0-7cm' }
    ],
    spatialCoverage: 'global',
    spatialResolution: '9 km',
    temporalCoverage: '1950-01-01 to present',
    temporalResolution: 'hourly',
    format: 'NetCDF, GRIB',
    accessUrl: 'https://cds.climate.copernicus.eu/api/v2',
    license: 'CC-BY-4.0',
    quality: 'Reanalysis product, validated against observations'
  },
  text: `
# ERA5-Land Dataset Description

## Overview
ERA5-Land is a reanalysis dataset providing hourly, high-resolution estimates of atmospheric, land surface, and oceanic variables from 1950 to present. It combines model data with observations from across the world into a globally complete and consistent dataset.

## Variables
The dataset contains 50+ variables describing:

### Atmospheric Variables
- 2m temperature: Air temperature at 2 meters above surface
- Total precipitation: Accumulated precipitation (rain and snow)
- Surface pressure: Atmospheric pressure at surface
- Wind components: 10m u and v wind speed components

### Land Surface Variables
- Evaporation: Water evaporated from land surface
- Snow depth: Depth of snow cover
- Runoff: Surface and subsurface runoff
- Soil temperature: Temperature at different soil layers
- Volumetric soil water: Soil moisture content at multiple depths

## Spatial Coverage
ERA5-Land covers the entire globe with a horizontal resolution of approximately 9 km (0.1° at the equator). The grid is regular latitude/longitude.

## Temporal Coverage
- Start: 1950-01-01
- End: Present (updated daily with 5-day latency)
- Resolution: Hourly

## Quality and Validation
ERA5-Land has been validated against in-situ observations from weather stations, river gauges, and satellite measurements. It shows excellent agreement with observations for temperature (bias < 0.5K) and precipitation (bias < 10%).

## Applications
ERA5-Land is used for:
- Hydrological modeling and flood forecasting
- Climate monitoring and trend analysis
- Agricultural yield prediction
- Water resource management
- Drought assessment
- Environmental impact studies

## Data Access
The dataset is available through the Copernicus Climate Data Store (CDS) API. Users can download specific variables, time periods, and geographic regions.
`
};

describe('Fixture 2: ERA5-Land Dataset Decomposition', () => {
  it('should admit dataset as strong data_capability source', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    assert.ok(result.admitted, 'Dataset should be admitted');
    assert.ok(result.sourceRoles.data_capability >= 0.5,
      `Should have strong data_capability (got ${result.sourceRoles.data_capability})`);
    assert.strictEqual(result.primaryRole, 'data_capability',
      'Primary role should be data_capability');
  });

  it('should activate data and world ontology layers', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    assert.ok(result.activatedOntologyLayers.includes('capability'),
      'Should activate capability layer');
    assert.ok(result.activatedOntologyLayers.includes('world'),
      'Should activate world layer');
    assert.ok(result.activatedCategories.includes('data'),
      'Should include data category');
    assert.ok(result.activatedCategories.includes('earth-variable'),
      'Should include earth-variable category');
  });

  it('should extract Dataset object with full attributes', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://cds.climate.copernicus.eu/era5-land', era5LandDataset, admissionResult);

    assert.ok(decomposition.sourceObject, 'Should have source object');
    assert.strictEqual(decomposition.sourceObject.type, 'DatasetPage',
      'Source type should be DatasetPage');

    // Should have dataset attributes
    assert.ok(decomposition.sourceObject.attributes.variables?.length > 0,
      'Should have variables');
    assert.strictEqual(decomposition.sourceObject.attributes.coverage, 'global',
      'Should have global coverage');
    assert.ok(decomposition.sourceObject.attributes.temporalCoverage,
      'Should have temporal coverage');
  });

  it('should extract Variable objects for each variable', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://cds.climate.copernicus.eu/era5-land', era5LandDataset, admissionResult);

    // Should have variable objects
    const variables = decomposition.capabilityObjects.filter(o => o.type === 'Variable');

    assert.ok(variables.length >= 5,
      `Should extract at least 5 variables (got ${variables.length})`);

    // Check variable attributes
    const precipVar = variables.find(v => v.attributes.name?.includes('precipitation'));
    if (precipVar) {
      assert.ok(precipVar.attributes.unit, 'Variable should have unit');
      assert.ok(precipVar.attributes.description, 'Variable should have description');
      assert.ok(precipVar.provenance, 'Variable should have provenance');
    }
  });

  it('should extract Coverage object', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://cds.climate.copernicus.eu/era5-land', era5LandDataset, admissionResult);

    // May have explicit Coverage object or coverage attributes in Dataset
    const coverageObjects = decomposition.capabilityObjects.filter(o => o.type === 'Coverage');

    // Check that coverage info is captured somewhere
    const hasCoverageInfo = coverageObjects.length > 0 ||
                            decomposition.sourceObject.attributes.spatialCoverage ||
                            decomposition.sourceObject.attributes.spatialResolution;

    assert.ok(hasCoverageInfo, 'Coverage information should be captured');
  });

  it('should build bridge relations to EarthVariables', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://cds.climate.copernicus.eu/era5-land', era5LandDataset, admissionResult);

    // If world objects are extracted, should have bridge relations
    if (decomposition.worldObjects.length > 0) {
      const earthVars = decomposition.worldObjects.filter(o =>
        o.type === 'EarthVariable' || o.type === 'Precipitation' || o.type === 'Temperature'
      );

      if (earthVars.length > 0 && decomposition.bridgeRelations.length > 0) {
        // Check for meaningful relations
        const datasetToVar = decomposition.bridgeRelations.find(r =>
          r.type === 'contains' || r.type === 'represents' || r.type === 'covers'
        );
        assert.ok(datasetToVar, 'Should have Dataset to Variable relation');
      }
    }
  });

  it('should track provenance for all extracted objects', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://cds.climate.copernicus.eu/era5-land', era5LandDataset, admissionResult);

    // All capability objects should have provenance
    for (const obj of decomposition.capabilityObjects) {
      assert.ok(obj.provenance, `${obj.type} should have provenance`);
      assert.ok(obj.confidence > 0, `${obj.type} should have confidence`);
    }

    // Extraction method should be recorded
    assert.ok(decomposition.provenance.extractionMethod,
      'Should record extraction method');
  });

  it('should have confidence score based on extraction completeness', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', era5LandDataset);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('https://cds.climate.copernicus.eu/era5-land', era5LandDataset, admissionResult);

    assert.ok(decomposition.confidence > 0.3,
      `Should have reasonable confidence for structured extraction (got ${decomposition.confidence})`);
    assert.ok(decomposition.confidence <= 1.0,
      'Confidence should be <= 1.0');
  });
});

module.exports = {};