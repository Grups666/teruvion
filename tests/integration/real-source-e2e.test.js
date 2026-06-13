#!/usr/bin/env node
/**
 * Real Source End-to-End Test Runner
 * Tests the pipeline against actual real-world sources:
 * - DOI papers (Earth science)
 * - GitHub repositories (models/tools)
 * - Dataset pages
 * - Policy reports
 * - News articles
 *
 * This validates:
 * 1. Source admission correctness
 * 2. Ontology activation appropriateness
 * 3. Decomposition quality (objects, relations, evidence)
 * 4. Provenance validity (sourceText verification)
 * 5. Bridge relation semantic correctness
 */

const path = require('path');
const fs = require('fs');
const { assert, describe, it } = require('../setup');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');
const { validateRelation, getValidRelations, getConfidenceCap, BRIDGE_RELATION_SEMANTICS } = require('../../core/registry/ontology/relation-semantics');

// ============================================================================
// REAL SOURCE DEFINITIONS
// ============================================================================

/**
 * These are real sources that the pipeline should be able to process.
 * They represent the diversity of Digital Earth inputs.
 */
const REAL_SOURCES = {
  // === DOI Papers (Earth Science) ===

  doi_flood_lstm: {
    type: 'DOI',
    input: '10.1029/2021WR031788',
    metadata: {
      type: 'Paper',
      title: 'Deep learning for flood forecasting: A review and comparison of models',
      doi: '10.1029/2021WR031788',
      authors: ['Zhang, Y.', 'Wang, L.', 'Chen, X.'],
      year: 2022,
      venue: 'Water Resources Research',
      keywords: ['deep learning', 'flood forecasting', 'LSTM', 'neural network', 'hydrology', 'prediction'],
      abstract: 'This paper reviews deep learning approaches for flood forecasting, comparing LSTM, CNN, and Transformer models across multiple basins. We analyze performance metrics including Nash-Sutcliffe Efficiency, peak timing accuracy, and extreme event detection. Results show LSTM ensemble achieves best overall performance for lead times up to 7 days.',
      // Structured metadata for extraction
      datasets: [
        { name: 'ERA5-Land', acronym: 'ERA5-Land', role: 'input', spatialCoverage: 'Global', temporalCoverage: '2000-2020' },
        { name: 'GRDC', acronym: 'GRDC', role: 'input', spatialCoverage: 'Global' },
        { name: 'CAMELS', acronym: 'CAMELS', role: 'input', spatialCoverage: 'CONUS' }
      ],
      models: [
        { name: 'LSTM ensemble', type: 'machine_learning', architecture: '3-layer LSTM with 128 hidden units' },
        { name: 'CNN-1D', type: 'machine_learning', architecture: '5-layer convolutional network' },
        { name: 'Transformer', type: 'machine_learning', architecture: '6-layer transformer with attention' }
      ],
      regions: [
        { name: 'Yangtze River Basin', type: 'basin', area: '1.8 million km²' },
        { name: 'Rhine River Basin', type: 'basin', area: '185,000 km²' },
        { name: 'Mississippi River Basin', type: 'basin', area: '3.2 million km²' },
        { name: 'Ganges River Basin', type: 'basin', area: '1.1 million km²' },
        { name: 'Amazon River Basin', type: 'basin', area: '7 million km²' }
      ]
    },
    text: `
# Deep Learning for Flood Forecasting: A Review and Comparison of Models

## Abstract
This paper reviews deep learning approaches for flood forecasting, comparing LSTM, CNN, and Transformer models across multiple basins. We analyze performance metrics including Nash-Sutcliffe Efficiency, peak timing accuracy, and extreme event detection.

## Introduction
Flood forecasting is critical for disaster risk reduction and water resources management. Traditional hydrological models require extensive calibration and may not capture nonlinear rainfall-runoff relationships. Deep learning offers an alternative approach that learns patterns directly from historical data.

## Methods

### Data Sources
We used three primary datasets:
- **ERA5-Land reanalysis**: 9km resolution meteorological data including precipitation, temperature, evapotranspiration (2000-2020)
- **GRDC discharge data**: Global River Discharge Centre records for 671 catchments
- **CAMELS dataset**: Catchment attributes and meteorological data for CONUS basins

### Model Architecture
We implemented three deep learning architectures:
- **LSTM ensemble**: 3-layer LSTM with 128 hidden units, trained on 10 years of hourly data
- **CNN-1D**: Convolutional network with 5 layers, kernel sizes 3-7-11-15-19
- **Transformer**: 6-layer transformer with attention mechanism, 512 embedding dimension

### Training Procedure
Models were trained using Adam optimizer with learning rate 0.001, batch size 256, early stopping after 10 epochs without improvement. We used k-fold cross-validation with k=5.

### Study Regions
We evaluated models across five river basins:
- **Yangtze River Basin** (China): Drainage area 1.8 million km²
- **Rhine River Basin** (Europe): Drainage area 185,000 km²
- **Mississippi River Basin** (USA): Drainage area 3.2 million km²
- **Ganges River Basin** (India): Drainage area 1.1 million km²
- **Amazon River Basin** (Brazil): Drainage area 7 million km²

## Results

### Overall Performance
The LSTM ensemble achieved the best overall performance:
- Nash-Sutcliffe Efficiency (NSE): 0.85 (average across basins)
- Peak timing error: 2.3 hours (average)
- Extreme event detection: 92% accuracy for events >2x mean discharge

### Basin-Specific Results
- Yangtze Basin: LSTM NSE=0.91, CNN NSE=0.78, Transformer NSE=0.82
- Rhine Basin: LSTM NSE=0.87, CNN NSE=0.81, Transformer NSE=0.79
- Mississippi Basin: LSTM NSE=0.83, CNN NSE=0.75, Transformer NSE=0.88

### Comparison with Traditional Models
We compared our deep learning models against GloFAS (Global Flood Awareness System):
- LSTM outperformed GloFAS in 4/5 basins for 7-day lead time
- GloFAS maintained advantage for lead times >10 days due to ensemble approach

## Discussion

### Transferability
The LSTM architecture shows strong transferability:
- Models trained on European basins achieved NSE>0.70 when applied to Asian basins
- Domain adaptation using fine-tuning on 1 year of local data improved transfer performance by 15%

### Limitations
Our study has several limitations:
- Limited to medium-sized basins (>50,000 km²); small catchments may behave differently
- Only tested on hourly data; sub-daily extreme events may need different architecture
- Does not account for hydraulic routing in downstream areas

## Conclusion
Deep learning, particularly LSTM ensembles, shows promise for flood forecasting. The approach is most effective for medium-term predictions (1-7 days) in large basins with sufficient historical data.

## Acknowledgments
Data provided by ECMWF (ERA5-Land), GRDC, and USGS (CAMELS).
`
  },

  doi_era5_land: {
    type: 'DOI',
    input: '10.5194/gmd-14-3833-2021',
    metadata: {
      type: 'Paper',
      title: 'ERA5-Land: A state-of-the-art dataset for land surface applications',
      doi: '10.5194/gmd-14-3833-2021',
      authors: ['Muñoz-Sabater, J.', 'Dutra, E.', 'Agustí-Panareda, A.'],
      year: 2021,
      venue: 'Geoscientific Model Development',
      keywords: ['ERA5-Land', 'reanalysis', 'land surface', 'meteorological data', 'precipitation', 'temperature', 'soil moisture', 'evapotranspiration'],
      abstract: "ERA5-Land is a reanalysis dataset providing hourly data for land surface variables at 9km resolution globally. It combines ECMWF's land surface model with atmospheric forcing from ERA5, offering improved representation of soil moisture, evapotranspiration, and surface runoff compared to ERA5.",
      // Structured metadata for extraction
      datasets: [
        { name: 'ERA5-Land', acronym: 'ERA5-Land', spatialCoverage: 'Global', temporalCoverage: '1950-present', resolution: '9km' }
      ],
      variables: [
        { name: 'precipitation', unit: 'mm' },
        { name: 'temperature', unit: 'K' },
        { name: 'soil moisture', unit: 'm³/m³' },
        { name: 'evapotranspiration', unit: 'mm' }
      ],
      institutions: [
        { name: 'ECMWF', type: 'organization' }
      ]
    },
    text: `
# ERA5-Land: A State-of-the-Art Dataset for Land Surface Applications

## Abstract
ERA5-Land is a reanalysis dataset providing hourly data for land surface variables at 9km resolution globally, covering 1950-present.

## Data Description

### Spatial Coverage
ERA5-Land covers the entire globe at 9km resolution (0.1° grid):
- Global extent: 90°N to 90°S, 180°W to 180°E
- Grid size: 3600 x 1801 pixels
- Projection: Regular latitude-longitude

### Temporal Coverage
- Historical period: January 1950 to present
- Update frequency: Hourly
- Latency: 5 days (preliminary), 2 months (final)

### Variables Available
ERA5-Land provides 50+ variables including:

**Water Cycle Variables:**
- Total precipitation (hourly, daily accumulated)
- Surface runoff
- Sub-surface runoff
- Soil moisture at 4 depths (0-7cm, 7-28cm, 28-100cm, 100-289cm)
- Evapotranspiration
- Snow depth
- Snow cover

**Temperature Variables:**
- 2m temperature
- Skin temperature
- Soil temperature at 4 depths

**Energy Variables:**
- Surface solar radiation
- Surface thermal radiation
- Net radiation

### Data Quality
ERA5-Land shows improved performance compared to ERA5:
- Soil moisture correlation with in-situ observations: 0.78 (vs 0.65 for ERA5)
- Precipitation bias: -2% (vs -8% for ERA5)
- Temperature RMSE: 1.2°C (vs 1.8°C for ERA5)

## Validation

### Validation Datasets
We validated ERA5-Land against:
- ISMN soil moisture network (200 stations)
- FLUXNET evapotranspiration measurements (50 sites)
- GRDC river discharge records (100 basins)

### Regional Performance
Performance varies by region:
- **Europe**: Best performance due to dense observation network
- **North America**: Good performance (COR > 0.7)
- **Africa**: Moderate performance (COR > 0.5)
- **Asia**: Variable performance, best in Japan/Korea

## Applications
ERA5-Land has been used for:
- Hydrological modeling forcing data
- Drought monitoring
- Agricultural yield prediction
- Climate change impact assessment
- Flood forecasting initialization

## Data Access
- ECMWF Climate Data Store: cds.climate.copernicus.eu
- API access via Python cdsapi package
- NetCDF format, monthly files (~2GB each)

## Citation
Muñoz-Sabater, J., et al. (2021). ERA5-Land: A state-of-the-art dataset for land surface applications. Geoscientific Model Development, 14, 3833-3869.
`
  },

  // === GitHub Repositories ===

  github_lstm_flood: {
    type: 'GitHub',
    input: 'https://github.com/neuralhydrology/neuralhydrology',
    metadata: {
      type: 'Repository',
      title: 'NeuralHydrology: Deep Learning for Hydrology',
      repo: 'https://github.com/neuralhydrology/neuralhydrology',
      language: 'Python',
      stars: 450,
      description: 'A Python library for deep learning hydrological modeling, including LSTM, EA-LSTM, and transformer architectures for rainfall-runoff prediction.',
      keywords: ['deep learning', 'hydrology', 'LSTM', 'streamflow', 'prediction', 'pytorch'],
      dependencies: ['pytorch', 'numpy', 'pandas', 'xarray'],
      architecture: 'LSTM ensemble with attention mechanism',
      // Structured metadata for extraction
      models: [
        { name: 'LSTM', type: 'machine_learning', architecture: 'LSTM with attention' },
        { name: 'EA-LSTM', type: 'machine_learning', architecture: 'Entity-Aware LSTM' }
      ],
      packages: [
        { name: 'pytorch', version: 'latest' },
        { name: 'numpy' },
        { name: 'pandas' },
        { name: 'xarray' }
      ]
    },
    text: `
# NeuralHydrology

A Python library for deep learning hydrological modeling.

## Features
- LSTM models for rainfall-runoff prediction
- EA-LSTM (Entity-Aware LSTM) for multi-basin training
- Transformer models for long-term forecasting
- Automatic calibration and validation
- CAMELS dataset integration

## Installation
pip install neuralhydrology

## Quick Start
from neuralhydrology.modelzoo import LSTM
model = LSTM(input_size=5, hidden_size=128)
predictions = model.predict(forcing_data)

## Supported Models
- LSTM: Standard Long Short-Term Memory
- EA-LSTM: Entity-Aware LSTM with static attributes
- Transformer: Attention-based sequence model
- CUDALSTM: GPU-accelerated implementation

## Datasets Supported
- CAMELS (US): 671 catchments
- CAMELS-GB: 669 UK catchments
- LamaH: 85 Austrian catchments
- HYSETS: 3148 North American catchments

## Citation
Kratzert, F., et al. (2019). NeuralHydrology - Interpreting LSTM hydrological models. Water Resources Research.
`
  },

  github_glofas: {
    type: 'GitHub',
    input: 'https://github.com/ecmwf/glofas',
    metadata: {
      type: 'Repository',
      title: 'GloFAS - Global Flood Awareness System',
      repo: 'https://github.com/ecmwf/glofas',
      language: 'Python',
      stars: 120,
      description: 'Global Flood Awareness System operational forecasting suite',
      keywords: ['flood forecasting', 'global', 'ECMWF', 'hydrology', 'early warning'],
      dependencies: ['ecmwflibs', 'pyhon', 'xarray'],
      architecture: 'Hydrological model + hydraulic routing',
      // Structured metadata for extraction
      models: [
        { name: 'GloFAS', type: 'hydrological', architecture: 'Hydrological model + hydraulic routing' }
      ],
      packages: [
        { name: 'ecmwflibs' },
        { name: 'xarray' }
      ],
      institutions: [
        { name: 'ECMWF', type: 'organization' }
      ]
    },
    text: `
# GloFAS - Global Flood Awareness System

Operational global flood forecasting system developed by ECMWF.

## System Overview
GloFAS provides 30-day flood forecasts for global river networks:
- Forecast horizon: 30 days
- Update frequency: Daily
- Coverage: Global rivers (>50km² drainage)
- Resolution: 0.1° (~10km)

## Components
- LISFLOOD hydrological model
- Hydrological routing
- Return period calculation
- Flood threshold detection

## Data Requirements
- ECMWF meteorological forecasts (HRES, ENS)
- ERA5-Land historical forcing
- River network topology
- Catchment boundaries

## Output Products
- River discharge forecasts
- Flood threshold exceedance probability
- Return period estimates
- Flood extent maps

## API Access
 GloFAS data available via:
- Copernicus Data Store
- API endpoints for operational users
- FTP for bulk downloads
`
  },

  // === Dataset Pages ===

  dataset_camels: {
    type: 'Dataset',
    input: 'https://ral.ucar.edu/solutions/products/camels',
    metadata: {
      type: 'Dataset',
      title: 'CAMELS: Catchment Attributes and Meteorological Data for Large-sample Hydrology',
      institution: 'NCAR/USGS',
      variables: ['streamflow', 'precipitation', 'temperature', 'catchment attributes'],
      coverage: 'CONUS (Continental United States)',
      resolution: 'Daily',
      temporal: '1980-2014',
      access: 'Open access',
      format: 'CSV, NetCDF',
      keywords: ['catchment', 'hydrology', 'large-sample', 'streamflow', 'CONUS', 'benchmark']
    },
    text: `
# CAMELS Dataset

Catchment Attributes and Meteorological Data for Large-sample Hydrology.

## Dataset Overview
CAMELS provides curated data for 671 catchments across the Continental United States, designed for large-sample hydrological studies.

## Catchment Selection
- 671 catchments with minimal human influence
- Drainage area: 10 - 10,000 km²
- Distributed across climate zones
- Minimal reservoir influence (<5% area)

## Variables Included

### Meteorological Data (1980-2014)
- Daily precipitation (DayMet, NLDAS, Maurer)
- Daily temperature (min, max, mean)
- Vapor pressure
- Solar radiation

### Hydrological Data
- Daily streamflow from USGS NWIS
- Catchment-averaged discharge
- Flow duration curves

### Catchment Attributes
- Climate indices (p_mean, aridity, seasonality)
- Topography (slope, elevation, area)
- Land cover (forest fraction, urban fraction)
- Soil properties (permeability, depth)
- Geology (dominant class, carbonate fraction)

## Data Access
- NCAR data portal: ral.ucar.edu
- USGS NWIS for streamflow
- DayMet for meteorology

## Citation
Addor, N., et al. (2017). The CAMELS data set: catchment attributes and meteorology for large-sample studies. Hydrol. Earth Syst. Sci., 21, 5293-5313.
`
  },

  // === Policy Reports ===

  report_ipcc_ar6: {
    type: 'Report',
    input: 'https://www.ipcc.ch/report/ar6/wg2/',
    metadata: {
      type: 'Report',
      title: 'IPCC AR6 WG2: Impacts, Adaptation and Vulnerability',
      institution: 'IPCC',
      year: 2022,
      reportType: 'Assessment Report',
      jurisdiction: 'Global',
      topics: ['climate change', 'impacts', 'adaptation', 'vulnerability', 'risk'],
      keywords: ['IPCC', 'climate', 'adaptation', 'vulnerability', 'risk assessment', 'policy'],
      // Structured metadata for extraction
      institutions: [
        { name: 'IPCC', type: 'organization' }
      ],
      policies: [
        { name: 'Climate adaptation measures', jurisdiction: 'Global' }
      ],
      assessments: [
        { name: 'Climate risk assessment', type: 'global', scope: 'Impacts and vulnerability' }
      ]
    },
    text: `
# IPCC Sixth Assessment Report - Working Group II: Impacts, Adaptation and Vulnerability

## Summary for Policymakers

### Key Findings

**Observed Impacts:**
- 3.5 billion people live in contexts highly vulnerable to climate change
- Human-induced climate change has caused widespread adverse impacts
- Weather and climate extremes have caused millions of deaths and economic losses

**Future Risks:**
- Flood risk projected to increase by 50% in many regions under 2°C warming
- 1 billion people at risk of coastal flooding by 2050
- Agricultural yields decline 10-25% in tropical regions

**Adaptation Options:**
- Nature-based solutions: floodplain restoration, wetland conservation
- Engineering measures: flood defenses, drought-resilient infrastructure
- Governance: early warning systems, land-use planning
- Financial: insurance mechanisms, climate funds

### Regional Chapters

**Chapter 4: Water**
- Water availability projected to decrease in 60% of regions
- Flood risk increasing in Asian monsoon regions
- Glacier retreat affecting water security in high mountains

**Chapter 5: Food**
- Crop yields declining in tropical regions
- Food security at risk for 800 million people
- Adaptation requires diversified agriculture

**Chapter 6: Cities**
- Urban flood risk increasing
- Heat island effects intensifying
- Infrastructure vulnerability rising

**Chapter 7: Health**
- Heat-related mortality increasing
- Vector-borne diseases expanding
- Mental health impacts growing

### Adaptation Assessment

**Current Adaptation:**
- 170 countries have adaptation plans
- Implementation gap of 70%
- Early warning coverage: 40% of countries

**Adaptation Limits:**
- Hard limits: biophysical thresholds
- Soft limits: governance, financial constraints

### Recommendations

**Accelerate Adaptation:**
- Strengthen early warning systems (target: 100% coverage by 2027)
- Increase climate finance (target: $100B annually)
- Mainstream adaptation into planning
- Enhance transboundary cooperation
`
  },

  report_wmo_ew4all: {
    type: 'Report',
    input: 'https://public.wmo.int/en/programmes/early-warnings-for-all',
    metadata: {
      type: 'Report',
      title: 'Early Warnings for All: Global Status Report 2023',
      institution: 'WMO',
      year: 2023,
      reportType: 'Assessment Report',
      jurisdiction: 'Global',
      topics: ['early warning systems', 'disaster risk reduction', 'climate adaptation'],
      hazards: ['flood', 'drought', 'cyclone', 'heatwave', 'wildfire'],
      keywords: ['early warning', 'WMO', 'disaster risk', 'adaptation', 'hazard', 'monitoring'],
      // Structured metadata for extraction
      institutions: [
        { name: 'WMO', type: 'organization' }
      ],
      interventions: [
        { name: 'Early warning systems', type: 'adaptation', entityType: 'AdaptationMeasure' }
      ],
      hazards: [
        { type: 'flood' },
        { type: 'drought' },
        { type: 'cyclone' },
        { type: 'heatwave' },
        { type: 'wildfire' }
      ]
    },
    text: `
# Early Warnings for All: Global Status Report 2023

## Executive Summary
The Early Warnings for All (EW4All) initiative aims to ensure every person on Earth is protected by early warning systems by 2027.

## Current Status
- 50% of countries have inadequate early warning systems
- Only 40% of least developed countries have multi-hazard early warnings
- 3.5 billion people lack adequate protection from climate hazards

## Regional Analysis

### Africa
- Flood risk: High in West and East Africa
- Drought risk: Severe in Sahel and Horn of Africa
- Early warning coverage: 30% of population

### Asia-Pacific
- Cyclone risk: High in South and Southeast Asia
- Flood risk: Extreme in South Asian river basins
- Early warning coverage: 55% of population

## Key Findings

### Assessment 1: Flood Early Warning Systems
- Coverage: 60% of flood-prone areas
- Gap: Last-mile communication in rural areas
- Recommendation: Invest in community-based warning systems

### Assessment 2: Drought Monitoring
- Coverage: 35% of drought-prone regions
- Gap: Integration of seasonal forecasts
- Recommendation: Strengthen regional drought networks

### Assessment 3: Cyclone Tracking
- Coverage: 85% of cyclone-prone coastlines
- Gap: Warning dissemination in remote islands
- Recommendation: Expand satellite-based communication

## Interventions

### Intervention 1: National EWS Strengthening
- Target: 100 countries by 2025
- Budget: $3.1 billion
- Activities: Technical capacity, infrastructure development

### Intervention 2: Community-Based Warning Networks
- Target: 1000 communities by 2027
- Budget: $500 million
- Activities: Training, equipment, communication systems

## Governance Framework
The initiative operates under the Sendai Framework for Disaster Risk Reduction and aligns with the Paris Agreement.
`
  },

  // === News Articles ===

  news_flood_pakistan: {
    type: 'News',
    input: 'https://reuters.com/world/pakistan-floods-2022',
    metadata: {
      type: 'News',
      title: 'Devastating Floods Hit Pakistan, Leaving Millions Displaced',
      url: 'https://reuters.com/world/pakistan-floods-2022',
      date: '2022-08-30',
      venue: 'Reuters',
      location: 'Pakistan',
      event: 'flood',
      keywords: ['flood', 'Pakistan', 'disaster', 'displaced', 'monsoon', 'climate'],
      // Structured metadata for extraction
      hazards: [
        { type: 'flood', name: 'Pakistan Floods 2022', location: 'Pakistan', date: '2022-08-30' }
      ],
      regions: [
        { name: 'Pakistan', type: 'country' }
      ],
      interventions: [
        { name: 'Emergency response', type: 'emergency', entityType: 'EmergencyResponse' }
      ]
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
"This is a climate catastrophe of biblical proportions," said Climate Minister Sherry Rehman.
`
  },

  news_heatwave_europe: {
    type: 'News',
    input: 'https://bbc.com/news/europe-heatwave-2023',
    metadata: {
      type: 'News',
      title: 'Record Heatwave Sweeps Europe, Breaking Temperature Records',
      url: 'https://bbc.com/news/europe-heatwave-2023',
      date: '2023-07-18',
      venue: 'BBC',
      location: 'Europe',
      event: 'heatwave',
      keywords: ['heatwave', 'Europe', 'temperature', 'climate', 'record', 'health'],
      // Structured metadata for extraction
      hazards: [
        { type: 'heatwave', name: 'Europe Heatwave 2023', location: 'Europe', date: '2023-07-18' }
      ],
      regions: [
        { name: 'Europe', type: 'region' }
      ],
      interventions: [
        { name: 'Heat action plan', type: 'adaptation', entityType: 'AdaptationMeasure' }
      ]
    },
    text: `
# Record Heatwave Sweeps Europe, Breaking Temperature Records

By BBC News
July 18, 2023

## Overview
An unprecedented heatwave has swept across Europe, breaking temperature records in multiple countries and triggering health warnings.

## Temperature Records Broken
- **Rome**: 42.3°C (previous record: 40.1°C)
- **Madrid**: 41.2°C
- **Paris**: 40.5°C
- **London**: 39.1°C
- **Berlin**: 38.7°C

## Health Impacts
- Heat-related hospitalizations: 5,000+ across Europe
- Deaths attributed to heat: Estimated 1,200
- Vulnerable populations: Elderly, outdoor workers, children

## Infrastructure Strain
- Power grid stress from air conditioning demand
- Rail speed restrictions due to track expansion
- School closures in multiple countries

## Response Measures
- Red alerts issued in Italy, Spain, Greece
- Public cooling centers opened
- Outdoor work banned during peak hours
- Hospital emergency protocols activated

## Climate Context
Scientists confirm:
- This heatwave 5x more likely due to climate change
- Mediterranean warming faster than global average
- Future heatwaves projected to be more frequent
`
  }
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Real Source End-to-End Tests', () => {

  // Test each real source
  for (const [sourceName, source] of Object.entries(REAL_SOURCES)) {
    describe(`Source: ${sourceName}`, () => {

      it('should admit source correctly', async () => {
        const admission = new SourceAdmission();
        const result = await admission.evaluate(source.input, source, source.metadata);

        // Basic admission check
        assert.ok(result.admitted, `${sourceName} should be admitted`);

        // Source type detection
        assert.ok(result.sourceType, 'Should detect source type');

        // Primary role detection
        assert.ok(result.primaryRole, 'Should have primary role');

        // Role scores should be reasonable
        const maxRoleScore = Math.max(...Object.values(result.sourceRoles));
        assert.ok(maxRoleScore >= 0.2, 'Should have at least one role with score >= 0.2');

        console.log(`  ${sourceName}: primaryRole=${result.primaryRole}, depth=${result.depth}`);
      });

      it('should activate appropriate ontology layers', async () => {
        const admission = new SourceAdmission();
        const result = await admission.evaluate(source.input, source, source.metadata);

        // Check activated layers
        assert.ok(result.activatedOntologyLayers.length > 0, 'Should activate ontology layers');

        // Check activated categories
        assert.ok(result.activatedCategories.length > 0, 'Should activate categories');

        // Layer activation should match source role
        if (result.primaryRole === 'earth_content' || result.primaryRole === 'modeling_capability') {
          assert.ok(result.activatedOntologyLayers.includes('world'),
            'Earth/modeling sources should activate world layer');
        }

        if (result.primaryRole === 'data_capability') {
          assert.ok(result.activatedOntologyLayers.includes('capability'),
            'Data sources should activate capability layer');
        }
      });

      it('should decompose into objects', async () => {
        const admission = new SourceAdmission();
        const admissionResult = await admission.evaluate(source.input, source, source.metadata);

        const decomposer = new DigitalEarthDecomposer();
        const decomposition = await decomposer.decompose(source.input, source, admissionResult);

        // Source object should be created
        assert.ok(decomposition.sourceObject, 'Should create source object');
        assert.ok(decomposition.sourceObject.type, 'Source object should have type');

        // Should have extracted objects (depending on depth)
        const totalObjects = decomposition.capabilityObjects.length +
                             decomposition.worldObjects.length +
                             decomposition.evidenceObjects.length;

        if (admissionResult.depth === 'deep' || admissionResult.depth === 'structured') {
          assert.ok(totalObjects >= 3,
            `Deep/structured processing should extract >=3 objects (got ${totalObjects})`);
        }

        console.log(`    Extracted: ${decomposition.capabilityObjects.length} capabilities, ` +
                    `${decomposition.worldObjects.length} world, ` +
                    `${decomposition.evidenceObjects.length} evidence`);
      });

      it('should have valid provenance for extracted objects', async () => {
        const admission = new SourceAdmission();
        const admissionResult = await admission.evaluate(source.input, source, source.metadata);

        const decomposer = new DigitalEarthDecomposer();
        const decomposition = await decomposer.decompose(source.input, source, admissionResult);

        // Check provenance on all objects
        const allObjects = [
          ...decomposition.capabilityObjects,
          ...decomposition.worldObjects,
          ...decomposition.evidenceObjects
        ];

        for (const obj of allObjects) {
          assert.ok(obj.provenance, `${obj.type} should have provenance`);
          assert.ok(obj.provenance.section || obj.provenance.extractedAt,
            'Provenance should have section or timestamp');

          // If has sourceText, check validation status
          if (obj.provenance.sourceText) {
            assert.ok(obj.provenance.hasSourceText !== undefined,
              'sourceText should be marked');
          }
        }
      });

      it('should create bridge relations between capabilities and world objects', async () => {
        const admission = new SourceAdmission();
        const admissionResult = await admission.evaluate(source.input, source, source.metadata);

        const decomposer = new DigitalEarthDecomposer();
        const decomposition = await decomposer.decompose(source.input, source, admissionResult);

        // Check bridge relations exist (for deep/structured)
        if (admissionResult.depth === 'deep' || admissionResult.depth === 'structured') {
          if (decomposition.capabilityObjects.length > 0 && decomposition.worldObjects.length > 0) {
            // Relations should be present
            console.log(`    Bridge relations: ${decomposition.bridgeRelations.length}`);

            // Validate relation semantics
            for (const rel of decomposition.bridgeRelations) {
              assert.ok(rel.type, 'Relation should have type');
              assert.ok(rel.from, 'Relation should have from');
              assert.ok(rel.to, 'Relation should have to');
              assert.ok(rel.confidence >= 0 && rel.confidence <= 1,
                'Confidence should be 0-1');

              // Check for fallback marker if confidence is low
              if (rel.confidence < 0.7 && !rel.provenance?.sourceText) {
                assert.ok(rel.isFallback || rel.inferenceMethod === 'type-pattern',
                  'Low confidence without evidence should be marked as fallback');
              }
            }
          }
        }
      });

      it('should have appropriate confidence scores', async () => {
        const admission = new SourceAdmission();
        const admissionResult = await admission.evaluate(source.input, source, source.metadata);

        const decomposer = new DigitalEarthDecomposer();
        const decomposition = await decomposer.decompose(source.input, source, admissionResult);

        // Overall confidence should be reasonable
        assert.ok(decomposition.confidence >= 0 && decomposition.confidence <= 1,
          'Overall confidence should be 0-1');

        // Object confidence should be reasonable
        for (const obj of decomposition.capabilityObjects) {
          assert.ok(obj.confidence >= 0 && obj.confidence <= 1,
            `${obj.type} confidence should be 0-1`);
        }

        for (const obj of decomposition.worldObjects) {
          assert.ok(obj.confidence >= 0 && obj.confidence <= 1,
            `${obj.type} confidence should be 0-1`);
        }
      });
    });
  }

  // Cross-source validation tests
  describe('Cross-Source Validation', () => {

    it('should correctly classify DOI as Paper type', async () => {
      const admission = new SourceAdmission();

      const paperResult = await admission.evaluate(
        REAL_SOURCES.doi_flood_lstm.input,
        REAL_SOURCES.doi_flood_lstm,
        REAL_SOURCES.doi_flood_lstm.metadata
      );

      assert.strictEqual(paperResult.sourceType, 'Paper',
        'DOI should be classified as Paper');
    });

    it('should correctly classify GitHub as Repository type', async () => {
      const admission = new SourceAdmission();

      const repoResult = await admission.evaluate(
        REAL_SOURCES.github_lstm_flood.input,
        REAL_SOURCES.github_lstm_flood,
        REAL_SOURCES.github_lstm_flood.metadata
      );

      assert.strictEqual(repoResult.sourceType, 'Repository',
        'GitHub should be classified as Repository');
    });

    it('should correctly classify dataset pages', async () => {
      const admission = new SourceAdmission();

      const datasetResult = await admission.evaluate(
        REAL_SOURCES.dataset_camels.input,
        REAL_SOURCES.dataset_camels,
        REAL_SOURCES.dataset_camels.metadata
      );

      assert.strictEqual(datasetResult.sourceType, 'Dataset',
        'Dataset page should be classified as Dataset');
    });

    it('should assign modeling_capability to deep learning paper', async () => {
      const admission = new SourceAdmission();

      const result = await admission.evaluate(
        REAL_SOURCES.doi_flood_lstm.input,
        REAL_SOURCES.doi_flood_lstm,
        REAL_SOURCES.doi_flood_lstm.metadata
      );

      assert.ok(result.sourceRoles.modeling_capability >= 0.3,
        'Deep learning flood forecasting paper should have modeling_capability');
    });

    it('should assign data_capability to ERA5-Land paper', async () => {
      const admission = new SourceAdmission();

      const result = await admission.evaluate(
        REAL_SOURCES.doi_era5_land.input,
        REAL_SOURCES.doi_era5_land,
        REAL_SOURCES.doi_era5_land.metadata
      );

      assert.ok(result.sourceRoles.data_capability >= 0.3,
        'ERA5-Land dataset paper should have data_capability');
    });

    it('should assign event_signal to flood news', async () => {
      const admission = new SourceAdmission();

      const result = await admission.evaluate(
        REAL_SOURCES.news_flood_pakistan.input,
        REAL_SOURCES.news_flood_pakistan,
        REAL_SOURCES.news_flood_pakistan.metadata
      );

      assert.ok(result.sourceRoles.event_signal >= 0.4,
        'Flood news should have event_signal role');
    });

    it('should assign governance_capability to policy report', async () => {
      const admission = new SourceAdmission();

      const result = await admission.evaluate(
        REAL_SOURCES.report_ipcc_ar6.input,
        REAL_SOURCES.report_ipcc_ar6,
        REAL_SOURCES.report_ipcc_ar6.metadata
      );

      assert.ok(result.sourceRoles.governance_capability >= 0.3 ||
                 result.sourceRoles.evidence_assessment >= 0.3,
        'IPCC report should have governance or evidence role');
    });
  });

  describe('Cross-Source Fidelity', () => {
    const fidelityCases = [
      {
        name: 'technical paper',
        source: REAL_SOURCES.doi_flood_lstm,
        requiredFacets: ['data', 'method', 'evidence'],
        minScore: 70,
        minProductScore: 62
      },
      {
        name: 'repository',
        source: REAL_SOURCES.github_lstm_flood,
        requiredFacets: ['method', 'resource'],
        minScore: 60,
        minProductScore: 55
      },
      {
        name: 'dataset page',
        source: REAL_SOURCES.dataset_camels,
        requiredFacets: ['data', 'context', 'resource'],
        minScore: 70,
        minProductScore: 60
      },
      {
        name: 'policy report',
        source: REAL_SOURCES.report_wmo_ew4all,
        requiredFacets: ['context', 'evidence'],
        minScore: 60,
        minProductScore: 55
      },
      {
        name: 'news event',
        source: REAL_SOURCES.news_flood_pakistan,
        requiredFacets: ['context', 'evidence'],
        minScore: 60,
        minProductScore: 55
      }
    ];

    for (const testCase of fidelityCases) {
      it(`should preserve low-loss content facets for ${testCase.name}`, async () => {
        const admission = new SourceAdmission();
        const admissionResult = await admission.evaluate(
          testCase.source.input,
          testCase.source,
          testCase.source.metadata
        );
        const decomposer = new DigitalEarthDecomposer();
        const decomposition = await decomposer.decompose(testCase.source.input, testCase.source, admissionResult);
        const fidelity = decomposition.extractionIntegrity?.contentFidelity;

        assert.ok(fidelity, 'Should expose content fidelity integrity signals');
        assert.ok(
          fidelity.score >= testCase.minScore,
          `${testCase.name} should retain enough source facets (score ${fidelity.score}, missing ${fidelity.missingFacets?.join(', ')})`
        );

        for (const facet of testCase.requiredFacets) {
          assert.ok(
            fidelity.coveredFacets.includes(facet),
            `${testCase.name} should cover ${facet} facet; covered=${fidelity.coveredFacets.join(', ')} missing=${fidelity.missingFacets.join(', ')}`
          );
        }

        assert.strictEqual(
          fidelity.internalRouteLabels.length,
          0,
          `${testCase.name} route should not expose internal labels: ${fidelity.internalRouteLabels.join(', ')}`
        );

        const productReadiness = decomposition.extractionIntegrity?.productReadiness;
        assert.ok(productReadiness, 'Should expose product-level source-to-object graph quality');
        assert.ok(
          productReadiness.score >= testCase.minProductScore,
          `${testCase.name} product readiness should be reviewable enough (score ${productReadiness.score}, reasons ${productReadiness.reasons?.join('; ')})`
        );
        assert.notStrictEqual(
          productReadiness.components?.brief?.level,
          'missing',
          `${testCase.name} should not miss SourceBrief quality`
        );
        assert.notStrictEqual(
          productReadiness.components?.route?.level,
          'weak',
          `${testCase.name} should not have a weak ResearchRoute`
        );
      });
    }
  });

  // Bridge relation semantic tests
  describe('Bridge Relation Semantics', () => {

    it('should validate relation types against semantics', () => {
      // Test known relation types
      const validResult = validateRelation('covers', 'Dataset', 'Basin');
      assert.ok(validResult.valid, 'covers(Dataset, Basin) should be valid');

      const invalidResult = validateRelation('mitigates', 'Dataset', 'Basin');
      assert.ok(!invalidResult.valid, 'mitigates(Dataset, Basin) should be invalid');
    });

    it('should apply confidence caps correctly', () => {
      // With source evidence, confidence should be capped at 0.9
      const withEvidence = getConfidenceCap('covers', true);
      assert.ok(withEvidence <= 0.9, 'Confidence with evidence <=0.9');

      // Without evidence for fallback relation, confidence should be capped lower
      const noEvidence = getConfidenceCap('covers', false);
      assert.ok(noEvidence <= 0.6, 'Fallback confidence <=0.6');

      // Relations that don't allow fallback should have 0 confidence without evidence
      const noFallback = getConfidenceCap('measures', false);
      assert.strictEqual(noFallback, 0, 'measures without evidence should have 0 confidence');
    });

    it('should suggest valid relations for type combinations', () => {
      const validRels = getValidRelations('Model', 'Basin');

      assert.ok(validRels.some(r => r.type === 'simulates'),
        'Model→Basin should suggest simulates');

      assert.ok(validRels.some(r => r.type === 'covers'),
        'Model→Basin should suggest covers (spatial)');
    });
  });
});

module.exports = {};
