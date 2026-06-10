/**
 * Layer 3: Digital Earth World Ontology
 * Describes the Earth world itself - what exists on Earth, what happens, how resources flow, how risks form.
 *
 * This layer answers: "What is IN the Digital Earth? What happens on Earth? How do resources flow? How do risks form? How might the future evolve?"
 *
 * This is the true Digital Earth layer - where Earth science objects live.
 * Objects here are grounded in physical reality (rivers, basins, floods, etc.)
 */

const foundation = require('./foundation');

// ============================================================================
// DIGITAL EARTH WORLD ENTITY TYPES
// ============================================================================

const WORLD_ENTITIES = {
  // ============================================================
  // EARTH SYSTEM TYPES
  // ============================================================

  EarthSystem: {
    name: 'EarthSystem',
    extends: 'System',
    layer: 'world',
    category: 'earth-system',
    description: 'A subsystem of Earth (hydrosphere, atmosphere, biosphere, etc.)',
    additionalRequired: [],
    additionalOptional: [
      'type', 'components', 'processes', 'interactions',
      'spatialExtent', 'temporalExtent', 'state'
    ],
    additionalDefaults: {}
  },

  Hydrosphere: {
    name: 'Hydrosphere',
    extends: 'EarthSystem',
    layer: 'world',
    category: 'earth-system',
    description: 'The water system of Earth',
    additionalRequired: [],
    additionalOptional: [
      'components', 'processes', 'reservoirs', 'fluxes'
    ],
    additionalDefaults: { type: 'hydrosphere' }
  },

  Atmosphere: {
    name: 'Atmosphere',
    extends: 'EarthSystem',
    layer: 'world',
    category: 'earth-system',
    description: 'The atmospheric system of Earth',
    additionalRequired: [],
    additionalOptional: [
      'components', 'processes', 'circulation', 'composition'
    ],
    additionalDefaults: { type: 'atmosphere' }
  },

  Biosphere: {
    name: 'Biosphere',
    extends: 'EarthSystem',
    layer: 'world',
    category: 'earth-system',
    description: 'The living system of Earth',
    additionalRequired: [],
    additionalOptional: [
      'ecosystems', 'biodiversity', 'processes', 'distribution'
    ],
    additionalDefaults: { type: 'biosphere' }
  },

  Cryosphere: {
    name: 'Cryosphere',
    extends: 'EarthSystem',
    layer: 'world',
    category: 'earth-system',
    description: 'The frozen water system of Earth',
    additionalRequired: [],
    additionalOptional: [
      'glaciers', 'iceSheets', 'seaIce', 'permafrost', 'snowCover'
    ],
    additionalDefaults: { type: 'cryosphere' }
  },

  Lithosphere: {
    name: 'Lithosphere',
    extends: 'EarthSystem',
    layer: 'world',
    category: 'earth-system',
    description: 'The solid Earth system',
    additionalRequired: [],
    additionalOptional: [
      'crust', 'processes', 'resources', 'hazards'
    ],
    additionalDefaults: { type: 'lithosphere' }
  },

  Anthroposphere: {
    name: 'Anthroposphere',
    extends: 'EarthSystem',
    layer: 'world',
    category: 'earth-system',
    description: 'The human system on Earth',
    additionalRequired: [],
    additionalOptional: [
      'population', 'infrastructure', 'activities', 'impacts'
    ],
    additionalDefaults: { type: 'anthroposphere' }
  },

  // ============================================================
  // EARTH OBJECT TYPES (Spatial entities)
  // ============================================================

  EarthObject: {
    name: 'EarthObject',
    extends: 'Object',
    layer: 'world',
    category: 'earth-object',
    description: 'A spatially-defined object on Earth',
    additionalRequired: [],
    additionalOptional: [
      'geometry', 'bbox', 'centroid', 'area', 'crs'
    ],
    additionalDefaults: {}
  },

  Region: {
    name: 'Region',
    extends: 'EarthObject',
    layer: 'world',
    category: 'earth-object',
    description: 'A geographic region',
    additionalRequired: [],
    additionalOptional: [
      'type', 'country', 'adminLevel', 'parentRegion',
      'subRegions', 'characteristics'
    ],
    additionalDefaults: { type: 'region' }
  },

  Basin: {
    name: 'Basin',
    extends: 'Region',
    layer: 'world',
    category: 'earth-object',
    description: 'A river basin or catchment',
    additionalRequired: [],
    additionalOptional: [
      'area', 'perimeter', 'mainRiver', 'outlet',
      'streamOrder', 'drainageDensity', 'elevationRange',
      'climateZone', 'landUse', 'population'
    ],
    additionalDefaults: {}
  },

  Watershed: {
    name: 'Watershed',
    extends: 'Basin',
    layer: 'world',
    category: 'earth-object',
    description: 'A watershed dividing area',
    additionalRequired: [],
    additionalOptional: ['divides', 'contributionArea'],
    additionalDefaults: {}
  },

  Glacier: {
    name: 'Glacier',
    extends: 'EarthObject',
    layer: 'world',
    category: 'earth-object',
    description: 'A glacier or ice cap',
    additionalRequired: [],
    additionalOptional: [
      'area', 'volume', 'thickness', 'velocity',
      'massBalance', 'terminus', 'type'
    ],
    additionalDefaults: {}
  },

  Lake: {
    name: 'Lake',
    extends: 'EarthObject',
    layer: 'world',
    category: 'earth-object',
    description: 'A lake or reservoir',
    additionalRequired: [],
    additionalOptional: [
      'area', 'volume', 'depth', 'type',
      'inflow', 'outflow', 'waterQuality'
    ],
    additionalDefaults: {}
  },

  Aquifer: {
    name: 'Aquifer',
    extends: 'EarthObject',
    layer: 'world',
    category: 'earth-object',
    description: 'An aquifer or groundwater system',
    additionalRequired: [],
    additionalOptional: [
      'area', 'thickness', 'storage', 'recharge',
      'discharge', 'waterLevel', 'quality'
    ],
    additionalDefaults: {}
  },

  Coastline: {
    name: 'Coastline',
    extends: 'EarthObject',
    layer: 'world',
    category: 'earth-object',
    description: 'A coastal zone',
    additionalRequired: [],
    additionalOptional: [
      'length', 'erosionRate', 'seaLevelRise',
      'infrastructure', 'population', 'ecosystems'
    ],
    additionalDefaults: {}
  },

  MountainRange: {
    name: 'MountainRange',
    extends: 'EarthObject',
    layer: 'world',
    category: 'earth-object',
    description: 'A mountain range',
    additionalRequired: [],
    additionalOptional: [
      'peaks', 'elevation', 'glaciers', 'climate'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // EARTH PROCESS TYPES
  // ============================================================

  EarthProcess: {
    name: 'EarthProcess',
    extends: 'Process',
    layer: 'world',
    category: 'earth-process',
    description: 'A natural process on Earth',
    additionalRequired: [],
    additionalOptional: [
      'type', 'drivers', 'rates', 'spatialPattern',
      'temporalPattern', 'uncertainty'
    ],
    additionalDefaults: {}
  },

  WaterCycle: {
    name: 'WaterCycle',
    extends: 'EarthProcess',
    layer: 'world',
    category: 'earth-process',
    description: 'The water cycle process',
    additionalRequired: [],
    additionalOptional: [
      'precipitation', 'evapotranspiration', 'runoff',
      'infiltration', 'groundwater', 'storage'
    ],
    additionalDefaults: {}
  },

  CarbonCycle: {
    name: 'CarbonCycle',
    extends: 'EarthProcess',
    layer: 'world',
    category: 'earth-process',
    description: 'The carbon cycle process',
    additionalRequired: [],
    additionalOptional: [
      'sources', 'sinks', 'fluxes', 'reservoirs'
    ],
    additionalDefaults: {}
  },

  Erosion: {
    name: 'Erosion',
    extends: 'EarthProcess',
    layer: 'world',
    category: 'earth-process',
    description: 'An erosion process',
    additionalRequired: [],
    additionalOptional: [
      'type', 'rate', 'drivers', 'impacts', 'sediment'
    ],
    additionalDefaults: {}
  },

  Sedimentation: {
    name: 'Sedimentation',
    extends: 'EarthProcess',
    layer: 'world',
    category: 'earth-process',
    description: 'A sedimentation process',
    additionalRequired: [],
    additionalOptional: [
      'source', 'sink', 'rate', 'impacts'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // EARTH VARIABLE TYPES (Observable quantities)
  // ============================================================

  EarthVariable: {
    name: 'EarthVariable',
    extends: 'Variable',
    layer: 'world',
    category: 'earth-variable',
    description: 'An observable Earth system variable',
    additionalRequired: ['name'],
    additionalOptional: [
      'units', 'range', 'typicalValues', 'measurementMethod',
      'uncertainty', 'temporalVariability', 'spatialVariability'
    ],
    additionalDefaults: {}
  },

  Streamflow: {
    name: 'Streamflow',
    extends: 'EarthVariable',
    layer: 'world',
    category: 'earth-variable',
    description: 'Streamflow or discharge',
    additionalRequired: [],
    additionalOptional: [
      'gauge', 'statistics', 'extremes', 'trends', 'seasonality'
    ],
    additionalDefaults: { units: 'm3/s' }
  },

  Precipitation: {
    name: 'Precipitation',
    extends: 'EarthVariable',
    layer: 'world',
    category: 'earth-variable',
    description: 'Precipitation',
    additionalRequired: [],
    additionalOptional: [
      'type', 'statistics', 'extremes', 'seasonality', 'trends'
    ],
    additionalDefaults: { units: 'mm' }
  },

  Temperature: {
    name: 'Temperature',
    extends: 'EarthVariable',
    layer: 'world',
    category: 'earth-variable',
    description: 'Temperature',
    additionalRequired: [],
    additionalOptional: [
      'type', 'statistics', 'extremes', 'seasonality', 'trends'
    ],
    additionalDefaults: { units: '°C' }
  },

  SoilMoisture: {
    name: 'SoilMoisture',
    extends: 'EarthVariable',
    layer: 'world',
    category: 'earth-variable',
    description: 'Soil moisture',
    additionalRequired: [],
    additionalOptional: [
      'depth', 'statistics', 'seasonality', 'trends'
    ],
    additionalDefaults: { units: 'm3/m3' }
  },

  GroundwaterLevel: {
    name: 'GroundwaterLevel',
    extends: 'EarthVariable',
    layer: 'world',
    category: 'earth-variable',
    description: 'Groundwater level',
    additionalRequired: [],
    additionalOptional: [
      'aquifer', 'depth', 'statistics', 'trends', 'recharge'
    ],
    additionalDefaults: { units: 'm' }
  },

  Evapotranspiration: {
    name: 'Evapotranspiration',
    extends: 'EarthVariable',
    layer: 'world',
    category: 'earth-variable',
    description: 'Evapotranspiration',
    additionalRequired: [],
    additionalOptional: [
      'type', 'statistics', 'seasonality', 'drivers'
    ],
    additionalDefaults: { units: 'mm' }
  },

  // ============================================================
  // RESOURCE TYPES (Resources on Earth)
  // ============================================================

  ResourceStock: {
    name: 'ResourceStock',
    extends: 'Resource',
    layer: 'world',
    category: 'resource',
    description: 'A stock of natural resource',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'quantity', 'unit', 'location',
      'renewability', 'depletionRate', 'sustainability'
    ],
    additionalDefaults: {}
  },

  WaterResource: {
    name: 'WaterResource',
    extends: 'ResourceStock',
    layer: 'world',
    category: 'resource',
    description: 'A water resource',
    additionalRequired: [],
    additionalOptional: [
      'type', 'quality', 'availability', 'use',
      'stress', 'sustainability'
    ],
    additionalDefaults: {}
  },

  EnergyResource: {
    name: 'EnergyResource',
    extends: 'ResourceStock',
    layer: 'world',
    category: 'resource',
    description: 'An energy resource',
    additionalRequired: [],
    additionalOptional: [
      'type', 'potential', 'installed', 'capacity',
      'generation', 'renewability'
    ],
    additionalDefaults: {}
  },

  ResourceFlow: {
    name: 'ResourceFlow',
    extends: 'Process',
    layer: 'world',
    category: 'resource',
    description: 'A flow of resource between stocks',
    additionalRequired: ['name'],
    additionalOptional: [
      'source', 'sink', 'rate', 'timing',
      'variability', 'constraints'
    ],
    additionalDefaults: {}
  },

  WaterWithdrawal: {
    name: 'WaterWithdrawal',
    extends: 'ResourceFlow',
    layer: 'world',
    category: 'resource',
    description: 'Water withdrawal for use',
    additionalRequired: [],
    additionalOptional: [
      'sector', 'source', 'volume', 'seasonality',
      'efficiency', 'return'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // HAZARD TYPES
  // ============================================================

  Hazard: {
    name: 'Hazard',
    extends: 'Event',
    layer: 'world',
    category: 'hazard',
    description: 'A natural or anthropogenic hazard',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'magnitude', 'probability', 'location',
      'seasonality', 'trends', 'drivers'
    ],
    additionalDefaults: {}
  },

  FloodEvent: {
    name: 'FloodEvent',
    extends: 'Hazard',
    layer: 'world',
    category: 'hazard',
    description: 'A flood event',
    additionalRequired: [],
    additionalOptional: [
      'type', 'peakDischarge', 'returnPeriod', 'duration',
      'affectedArea', 'causes', 'antecedentConditions'
    ],
    additionalDefaults: {}
  },

  DroughtEvent: {
    name: 'DroughtEvent',
    extends: 'Hazard',
    layer: 'world',
    category: 'hazard',
    description: 'A drought event',
    additionalRequired: [],
    additionalOptional: [
      'type', 'severity', 'duration', 'area',
      'impacts', 'recovery'
    ],
    additionalDefaults: {}
  },

  Heatwave: {
    name: 'Heatwave',
    extends: 'Hazard',
    layer: 'world',
    category: 'hazard',
    description: 'A heatwave event',
    additionalRequired: [],
    additionalOptional: [
      'temperature', 'duration', 'area', 'humidity',
      'impacts', 'mortality'
    ],
    additionalDefaults: {}
  },

  Wildfire: {
    name: 'Wildfire',
    extends: 'Hazard',
    layer: 'world',
    category: 'hazard',
    description: 'A wildfire event',
    additionalRequired: [],
    additionalOptional: [
      'area', 'severity', 'duration', 'causes',
      'impacts', 'recovery'
    ],
    additionalDefaults: {}
  },

  Landslide: {
    name: 'Landslide',
    extends: 'Hazard',
    layer: 'world',
    category: 'hazard',
    description: 'A landslide event',
    additionalRequired: [],
    additionalOptional: [
      'type', 'volume', 'runout', 'triggers',
      'impacts', 'susceptibility'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // RISK TYPES
  // ============================================================

  EarthRisk: {
    name: 'EarthRisk',
    extends: 'Risk',
    layer: 'world',
    category: 'risk',
    description: 'A risk on Earth (hazard + exposure + vulnerability)',
    additionalRequired: ['name'],
    additionalOptional: [
      'hazard', 'exposure', 'vulnerability', 'probability',
      'impact', 'trends', 'management'
    ],
    additionalDefaults: {}
  },

  FloodRisk: {
    name: 'FloodRisk',
    extends: 'EarthRisk',
    layer: 'world',
    category: 'risk',
    description: 'Flood risk',
    additionalRequired: [],
    additionalOptional: [
      'hazardType', 'exposedAssets', 'vulnerabilityFunction',
      'riskMap', 'mitigation', 'insurance'
    ],
    additionalDefaults: {}
  },

  DroughtRisk: {
    name: 'DroughtRisk',
    extends: 'EarthRisk',
    layer: 'world',
    category: 'risk',
    description: 'Drought risk',
    additionalRequired: [],
    additionalOptional: [
      'hazardType', 'exposedSectors', 'vulnerabilityFunction',
      'riskMap', 'adaptation', 'earlyWarning'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // EXPOSURE & VULNERABILITY TYPES
  // ============================================================

  Exposure: {
    name: 'Exposure',
    extends: 'Entity',
    layer: 'world',
    category: 'exposure',
    description: 'Exposure of assets/people to hazard',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'value', 'location', 'hazards',
      'sectors', 'distribution'
    ],
    additionalDefaults: {}
  },

  Vulnerability: {
    name: 'Vulnerability',
    extends: 'Entity',
    layer: 'world',
    category: 'exposure',
    description: 'Vulnerability to hazard',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'factors', 'function', 'index',
      'reduction', 'adaptiveCapacity'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // INFRASTRUCTURE TYPES
  // ============================================================

  Infrastructure: {
    name: 'Infrastructure',
    extends: 'Object',
    layer: 'world',
    category: 'infrastructure',
    description: 'Human-built infrastructure',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'location', 'capacity', 'condition',
      'owner', 'services', 'age'
    ],
    additionalDefaults: {}
  },

  Dam: {
    name: 'Dam',
    extends: 'Infrastructure',
    layer: 'world',
    category: 'infrastructure',
    description: 'A dam',
    additionalRequired: [],
    additionalOptional: [
      'height', 'capacity', 'purpose', 'year',
      'river', 'basin', 'sedimentation'
    ],
    additionalDefaults: {}
  },

  Reservoir: {
    name: 'Reservoir',
    extends: 'Lake',
    layer: 'world',
    category: 'infrastructure',
    description: 'A reservoir',
    additionalRequired: [],
    additionalOptional: [
      'dam', 'capacity', 'purpose', 'operation',
      'sedimentation', 'waterQuality'
    ],
    additionalDefaults: {}
  },

  PowerGrid: {
    name: 'PowerGrid',
    extends: 'Infrastructure',
    layer: 'world',
    category: 'infrastructure',
    description: 'A power grid',
    additionalRequired: [],
    additionalOptional: [
      'substations', 'transmissionLines', 'capacity',
      'demand', 'generation', 'vulnerability'
    ],
    additionalDefaults: {}
  },

  WaterSupplySystem: {
    name: 'WaterSupplySystem',
    extends: 'Infrastructure',
    layer: 'world',
    category: 'infrastructure',
    description: 'A water supply system',
    additionalRequired: [],
    additionalOptional: [
      'sources', 'treatment', 'distribution', 'capacity',
      'demand', 'losses', 'quality'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // HUMAN ACTIVITY TYPES
  // ============================================================

  HumanActivity: {
    name: 'HumanActivity',
    extends: 'Process',
    layer: 'world',
    category: 'human-activity',
    description: 'A human activity on Earth',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'location', 'intensity', 'impacts',
      'drivers', 'trends'
    ],
    additionalDefaults: {}
  },

  Irrigation: {
    name: 'Irrigation',
    extends: 'HumanActivity',
    layer: 'world',
    category: 'human-activity',
    description: 'Irrigation activity',
    additionalRequired: [],
    additionalOptional: [
      'type', 'area', 'waterSource', 'efficiency',
      'crops', 'seasonality', 'impacts'
    ],
    additionalDefaults: {}
  },

  Urbanization: {
    name: 'Urbanization',
    extends: 'HumanActivity',
    layer: 'world',
    category: 'human-activity',
    description: 'Urbanization process',
    additionalRequired: [],
    additionalOptional: [
      'rate', 'area', 'population', 'landUse',
      'impacts', 'planning'
    ],
    additionalDefaults: {}
  },

  Deforestation: {
    name: 'Deforestation',
    extends: 'HumanActivity',
    layer: 'world',
    category: 'human-activity',
    description: 'Deforestation process',
    additionalRequired: [],
    additionalOptional: [
      'rate', 'area', 'drivers', 'impacts',
      'carbon', 'recovery'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // SCENARIO TYPES
  // ============================================================

  EarthScenario: {
    name: 'EarthScenario',
    extends: 'Scenario',
    layer: 'world',
    category: 'scenario',
    description: 'A scenario for Earth future',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'assumptions', 'pathway', 'timeHorizon',
      'indicators', 'narrative', 'quantification'
    ],
    additionalDefaults: {}
  },

  ClimateScenario: {
    name: 'ClimateScenario',
    extends: 'EarthScenario',
    layer: 'world',
    category: 'scenario',
    description: 'A climate scenario (RCP, SSP, etc.)',
    additionalRequired: [],
    additionalOptional: [
      'pathway', 'forcing', 'temperature', 'precipitation',
      'seaLevel', 'extremes'
    ],
    additionalDefaults: {}
  },

  DevelopmentScenario: {
    name: 'DevelopmentScenario',
    extends: 'EarthScenario',
    layer: 'world',
    category: 'scenario',
    description: 'A development scenario',
    additionalRequired: [],
    additionalOptional: [
      'population', 'gdp', 'landUse', 'energy',
      'water', 'emissions'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // MODEL OUTPUT TYPES
  // ============================================================

  ModelOutput: {
    name: 'ModelOutput',
    extends: 'Data',
    layer: 'world',
    category: 'model-output',
    description: 'Output from a model simulation',
    additionalRequired: ['name'],
    additionalOptional: [
      'model', 'scenario', 'variables', 'resolution',
      'timeRange', 'uncertainty', 'validation'
    ],
    additionalDefaults: {}
  },

  Forecast: {
    name: 'Forecast',
    extends: 'ModelOutput',
    layer: 'world',
    category: 'model-output',
    description: 'A forecast output',
    additionalRequired: [],
    additionalOptional: [
      'leadTime', 'issueTime', 'validTime', 'variables',
      'uncertainty', 'skill', 'verification'
    ],
    additionalDefaults: {}
  },

  Projection: {
    name: 'Projection',
    extends: 'ModelOutput',
    layer: 'world',
    category: 'model-output',
    description: 'A projection under scenario',
    additionalRequired: [],
    additionalOptional: [
      'scenario', 'timeHorizon', 'variables', 'uncertainty',
      'baseline', 'change'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // FEEDBACK & TELECONNECTION TYPES
  // ============================================================

  Feedback: {
    name: 'Feedback',
    extends: 'Relation',
    layer: 'world',
    category: 'feedback',
    description: 'A feedback mechanism in Earth system',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'strength', 'sign', 'mechanism',
      'timescale', 'uncertainty'
    ],
    additionalDefaults: {}
  },

  Teleconnection: {
    name: 'Teleconnection',
    extends: 'Relation',
    layer: 'world',
    category: 'feedback',
    description: 'A teleconnection between distant regions',
    additionalRequired: ['name'],
    additionalOptional: [
      'pattern', 'indices', 'mechanism', 'seasonality',
      'strength', 'impacts'
    ],
    additionalDefaults: {}
  },

  Threshold: {
    name: 'Threshold',
    extends: 'Entity',
    layer: 'world',
    category: 'feedback',
    description: 'A threshold or tipping point',
    additionalRequired: ['name', 'value'],
    additionalOptional: [
      'unit', 'type', 'consequences', 'reversibility',
      'proximity', 'monitoring'
    ],
    additionalDefaults: {}
  }
};

// ============================================================================
// DIGITAL EARTH WORLD RELATION TYPES
// ============================================================================

const WORLD_RELATIONS = {
  // === Spatial Relations ===
  drains_to: {
    name: 'drains_to',
    layer: 'world',
    category: 'spatial',
    description: 'Subject drains to the object',
    domain: ['Basin', 'Watershed', 'River'],
    range: ['Basin', 'Watershed', 'Lake', 'Ocean']
  },

  upstream_of: {
    name: 'upstream_of',
    layer: 'world',
    category: 'spatial',
    description: 'Subject is upstream of the object',
    domain: ['Basin', 'Watershed', 'Location'],
    range: ['Basin', 'Watershed', 'Location']
  },

  downstream_of: {
    name: 'downstream_of',
    layer: 'world',
    category: 'spatial',
    description: 'Subject is downstream of the object',
    domain: ['Basin', 'Watershed', 'Location'],
    range: ['Basin', 'Watershed', 'Location']
  },

  flows_through: {
    name: 'flows_through',
    layer: 'world',
    category: 'spatial',
    description: 'Subject flows through the object',
    domain: ['River', 'WaterFlow'],
    range: ['Basin', 'Region', 'Location']
  },

  // === System Relations ===
  part_of_system: {
    name: 'part_of_system',
    layer: 'world',
    category: 'system',
    description: 'Subject is part of the object Earth system',
    domain: ['Entity', 'EarthObject', 'EarthProcess'],
    range: ['EarthSystem', 'Hydrosphere', 'Atmosphere']
  },

  interacts_with: {
    name: 'interacts_with',
    layer: 'world',
    category: 'system',
    description: 'Subject interacts with the object',
    domain: ['EarthSystem', 'EarthProcess'],
    range: ['EarthSystem', 'EarthProcess']
  },

  // === Process Relations ===
  driven_by: {
    name: 'driven_by',
    layer: 'world',
    category: 'process',
    description: 'Subject is driven by the object',
    domain: ['EarthProcess', 'Hazard', 'Event'],
    range: ['Entity', 'Process', 'Variable']
  },

  affects: {
    name: 'affects',
    layer: 'world',
    category: 'process',
    description: 'Subject affects the object',
    domain: ['EarthProcess', 'HumanActivity', 'Hazard'],
    range: ['Entity', 'Location', 'System']
  },

  modifies: {
    name: 'modifies',
    layer: 'world',
    category: 'process',
    description: 'Subject modifies the object',
    domain: ['HumanActivity', 'Intervention'],
    range: ['EarthProcess', 'Resource', 'Entity']
  },

  // === Resource Relations ===
  supplies: {
    name: 'supplies',
    layer: 'world',
    category: 'resource',
    description: 'Subject supplies resource to the object',
    domain: ['ResourceStock', 'Basin', 'Aquifer'],
    range: ['HumanActivity', 'Infrastructure', 'Region']
  },

  withdraws_from: {
    name: 'withdraws_from',
    layer: 'world',
    category: 'resource',
    description: 'Subject withdraws from the object resource',
    domain: ['WaterWithdrawal', 'HumanActivity'],
    range: ['ResourceStock', 'Basin', 'Aquifer']
  },

  recharges: {
    name: 'recharges',
    layer: 'world',
    category: 'resource',
    description: 'Subject recharges the object',
    domain: ['Precipitation', 'River', 'Process'],
    range: ['Aquifer', 'ResourceStock']
  },

  // === Hazard Relations ===
  triggers_hazard: {
    name: 'triggers_hazard',
    layer: 'world',
    category: 'hazard',
    description: 'Subject triggers the object hazard',
    domain: ['Event', 'Process', 'Variable'],
    range: ['Hazard', 'FloodEvent', 'Landslide']
  },

  exacerbates: {
    name: 'exacerbates',
    layer: 'world',
    category: 'hazard',
    description: 'Subject exacerbates the object hazard',
    domain: ['HumanActivity', 'ClimateChange'],
    range: ['Hazard', 'Risk']
  },

  mitigates_hazard: {
    name: 'mitigates_hazard',
    layer: 'world',
    category: 'hazard',
    description: 'Subject mitigates the object hazard',
    domain: ['Infrastructure', 'Intervention'],
    range: ['Hazard', 'Risk']
  },

  // === Risk Relations ===
  exposed_to: {
    name: 'exposed_to',
    layer: 'world',
    category: 'risk',
    description: 'Subject is exposed to the object hazard',
    domain: ['Exposure', 'Infrastructure', 'Population'],
    range: ['Hazard', 'Risk']
  },

  vulnerable_to: {
    name: 'vulnerable_to',
    layer: 'world',
    category: 'risk',
    description: 'Subject is vulnerable to the object hazard',
    domain: ['Vulnerability', 'Entity'],
    range: ['Hazard', 'Risk']
  },

  generates_risk: {
    name: 'generates_risk',
    layer: 'world',
    category: 'risk',
    description: 'Subject generates the object risk',
    domain: ['Hazard', 'Exposure', 'Vulnerability'],
    range: ['EarthRisk', 'Risk']
  },

  // === Scenario Relations ===
  projects: {
    name: 'projects',
    layer: 'world',
    category: 'scenario',
    description: 'Subject projects the object under scenario',
    domain: ['Model', 'Projection'],
    range: ['Variable', 'Entity', 'Process']
  },

  under_scenario: {
    name: 'under_scenario',
    layer: 'world',
    category: 'scenario',
    description: 'Subject is under the object scenario',
    domain: ['Projection', 'Forecast', 'ModelOutput'],
    range: ['EarthScenario', 'ClimateScenario']
  },

  // === Feedback Relations ===
  feeds_back: {
    name: 'feeds_back',
    layer: 'world',
    category: 'feedback',
    description: 'Subject feeds back on the object',
    domain: ['Process', 'Variable'],
    range: ['Process', 'Variable']
  },

  teleconnected_to: {
    name: 'teleconnected_to',
    layer: 'world',
    category: 'feedback',
    description: 'Subject is teleconnected to the object',
    domain: ['Region', 'Variable', 'Process'],
    range: ['Region', 'Variable', 'Process']
  },

  approaches_threshold: {
    name: 'approaches_threshold',
    layer: 'world',
    category: 'feedback',
    description: 'Subject approaches the object threshold',
    domain: ['Variable', 'Entity'],
    range: ['Threshold']
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getMergedSchema(typeName) {
  const worldDef = WORLD_ENTITIES[typeName];
  if (!worldDef) return null;

  // Get parent schema from foundation
  let parentSchema = foundation.getEntitySchema(worldDef.extends);
  if (!parentSchema) {
    // Check if parent is another world type
    const parentDef = WORLD_ENTITIES[worldDef.extends];
    if (parentDef) {
      parentSchema = getMergedSchema(worldDef.extends);
    }
  }

  if (!parentSchema) {
    return {
      name: typeName,
      extends: worldDef.extends,
      layer: 'world',
      category: worldDef.category,
      description: worldDef.description,
      required: [...worldDef.additionalRequired],
      optional: [...worldDef.additionalOptional],
      defaults: { ...worldDef.additionalDefaults }
    };
  }

  return {
    name: typeName,
    extends: worldDef.extends,
    layer: 'world',
    category: worldDef.category,
    description: worldDef.description,
    required: [...parentSchema.required, ...worldDef.additionalRequired],
    optional: [...parentSchema.optional, ...worldDef.additionalOptional],
    defaults: { ...parentSchema.defaults, ...worldDef.additionalDefaults }
  };
}

function getWorldTypeNames() {
  return Object.keys(WORLD_ENTITIES);
}

function isWorldType(typeName) {
  return WORLD_ENTITIES.hasOwnProperty(typeName);
}

function getParentType(typeName) {
  const def = WORLD_ENTITIES[typeName];
  return def ? def.extends : null;
}

function getWorldTypesByCategory() {
  const categories = {};
  for (const [key, def] of Object.entries(WORLD_ENTITIES)) {
    const cat = def.category;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(def.name);
  }
  return categories;
}

function validateWorldType(type) {
  return Object.values(WORLD_ENTITIES).some(d => d.name === type);
}

module.exports = {
  WORLD_ENTITIES,
  WORLD_RELATIONS,
  getMergedSchema,
  getWorldTypeNames,
  isWorldType,
  getParentType,
  getWorldTypesByCategory,
  validateWorldType
};
