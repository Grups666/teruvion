/**
 * Teruvion Ontology - Five Layer System
 * Main entry point - delegates to layered ontology system
 *
 * Layer 0: Foundation Ontology (universal concepts)
 * Layer 1: Source Ontology (information sources)
 * Layer 2: Capability Ontology (building Digital Earth capabilities)
 * Layer 3: Digital Earth World Ontology (Earth objects and processes)
 * Layer 4: Domain Extensions (specialized domains)
 */

// Import the five-layer ontology system
const layeredOntology = require('./ontology/index');

// ============================================================================
// LEGACY EXPORTS (Backward Compatibility)
// ============================================================================

// Re-export everything from layered ontology
// This ensures existing code continues to work without changes

const ENTITY_TYPES = layeredOntology.ENTITY_TYPES;
const RELATION_TYPES = layeredOntology.RELATION_TYPES;
const ENTITY_SCHEMAS = layeredOntology.ENTITY_SCHEMAS;

// Re-export validation functions
const validateEntityType = layeredOntology.validateEntityType;
const validateRelationType = layeredOntology.validateRelationType;
const validateEntityAttributes = layeredOntology.validateEntityAttributes;
const getAllowedRelations = layeredOntology.getAllowedRelations;

// ============================================================================
// ENHANCED EXPORTS (New Five-Layer System)
// ============================================================================

// Layer management
const getEntityLayer = layeredOntology.getEntityLayer;
const getEntitiesByLayer = layeredOntology.getEntitiesByLayer;
const getEntitiesByCategory = layeredOntology.getEntitiesByCategory;
const getRelationsByCategory = layeredOntology.getRelationsByCategory;

// Schema access
const getEntitySchema = layeredOntology.getEntitySchema;
const getAllEntityTypes = layeredOntology.getAllEntityTypes;
const getAllRelationTypes = layeredOntology.getAllRelationTypes;

// Extension management
const registerDomainExtension = layeredOntology.registerDomainExtension;
const registerCustomExtension = layeredOntology.registerCustomExtension;

// Type resolution
const resolveTypeName = layeredOntology.resolveTypeName;
const getParentType = layeredOntology.getParentType;
const getTypeHierarchy = layeredOntology.getTypeHierarchy;

// Statistics
const getOntologyStats = layeredOntology.getOntologyStats;

// Layer modules (for advanced usage)
const foundationOntology = layeredOntology.foundation;
const sourceOntology = layeredOntology.source;
const capabilityOntology = layeredOntology.capability;
const worldOntology = layeredOntology.world;
const domainOntology = layeredOntology.domain;

// Extension API
const OntologyExtension = layeredOntology.OntologyExtension;
const ExtensionRegistry = layeredOntology.ExtensionRegistry;
const getRegistry = layeredOntology.getRegistry;

// ============================================================================
// LEGACY CONSTANTS (For backward compatibility)
// ============================================================================

// These are kept for code that still uses the old constant format
// e.g., ENTITY_TYPES.PAPER instead of 'Paper'

const LEGACY_ENTITY_CONSTANTS = {
  // Foundation entities
  ENTITY: 'Entity',
  OBJECT: 'Object',
  SYSTEM: 'System',
  STATE: 'State',
  PROCESS: 'Process',
  EVENT: 'Event',
  ACTION: 'Action',
  INTERVENTION: 'Intervention',
  AGENT: 'Agent',
  RESOURCE: 'Resource',
  DATA: 'Data',
  CLAIM: 'Claim',
  EVIDENCE: 'Evidence',
  OBSERVATION: 'Observation',
  MEASUREMENT: 'Measurement',
  METHOD: 'Method',
  MODEL: 'Model',
  METRIC: 'Metric',
  UNCERTAINTY: 'Uncertainty',
  SCENARIO: 'Scenario',
  RISK: 'Risk',
  LOCATION: 'Location',
  TIME: 'Time',
  RELATION: 'Relation',

  // Source entities
  SOURCE: 'Source',
  PAPER: 'Paper',
  PREPRINT: 'Preprint',
  THESIS: 'Thesis',
  REPOSITORY: 'Repository',
  PACKAGE: 'Package',
  API_PAGE: 'APIPage',
  DATASET_PAGE: 'DatasetPage',
  DATA_CATALOG: 'DataCatalog',
  REPORT: 'Report',
  ASSESSMENT_REPORT: 'AssessmentReport',
  WHITE_PAPER: 'WhitePaper',
  NEWS: 'News',
  PRESS_RELEASE: 'PressRelease',
  POLICY_DOCUMENT: 'PolicyDocument',
  STANDARD_DOCUMENT: 'StandardDocument',
  DOCUMENTATION: 'Documentation',
  MODEL_CARD: 'ModelCard',
  BENCHMARK: 'Benchmark',
  TECHNICAL_BLOG: 'TechnicalBlog',
  ONTOLOGY_FILE: 'OntologyFile',
  KNOWLEDGE_GRAPH: 'KnowledgeGraph',

  // Capability entities - Data
  DATASET: 'Dataset',
  DATA_PRODUCT: 'DataProduct',
  VARIABLE: 'Variable',
  FEATURE: 'Feature',
  COVERAGE: 'Coverage',
  RESOLUTION: 'Resolution',
  DATA_QUALITY: 'DataQuality',

  // Capability entities - Observation
  SENSOR: 'Sensor',
  SATELLITE: 'Satellite',
  GAUGE: 'Gauge',
  STATION: 'Station',
  REMOTE_SENSING_SYSTEM: 'RemoteSensingSystem',
  IN_SITU_NETWORK: 'InSituNetwork',
  MONITORING_PROGRAM: 'MonitoringProgram',

  // Capability entities - Modeling
  ALGORITHM: 'Algorithm',
  SIMULATION: 'Simulation',
  FORECASTING: 'Forecasting',
  CALIBRATION: 'Calibration',
  VALIDATION: 'Validation',
  UNCERTAINTY_QUANTIFICATION: 'UncertaintyQuantification',

  // Capability entities - Computing
  SOFTWARE: 'Software',
  API: 'API',
  WORKFLOW: 'Workflow',
  PIPELINE: 'Pipeline',
  INTERFACE: 'Interface',
  EXECUTION_ENVIRONMENT: 'ExecutionEnvironment',
  CLOUD_SERVICE: 'CloudService',

  // Capability entities - Governance
  POLICY: 'Policy',
  REGULATION: 'Regulation',
  INSTITUTION: 'Institution',
  STAKEHOLDER: 'Stakeholder',
  MANAGEMENT_PLAN: 'ManagementPlan',
  STANDARD: 'Standard',
  PROTOCOL: 'Protocol',
  AGREEMENT: 'Agreement',

  // Capability entities - Socioeconomic
  POPULATION_DATASET: 'PopulationDataset',
  ECONOMIC_INDICATOR: 'EconomicIndicator',
  LAND_USE_CLASSIFICATION: 'LandUseClassification',
  INFRASTRUCTURE_INVENTORY: 'InfrastructureInventory',
  EXPOSURE_DATASET: 'ExposureDataset',
  VULNERABILITY_INDEX: 'VulnerabilityIndex',
  DEMAND_MODEL: 'DemandModel',
  BEHAVIOR_MODEL: 'BehaviorModel',

  // Capability entities - Evidence
  ASSESSMENT: 'Assessment',
  INDICATOR: 'Indicator',
  INDEX: 'Index',
  EVIDENCE_CHAIN: 'EvidenceChain',
  EVALUATION_FRAMEWORK: 'EvaluationFramework',
  RISK_ASSESSMENT: 'RiskAssessment',
  IMPACT_ASSESSMENT: 'ImpactAssessment',
  CONFIDENCE_LEVEL: 'ConfidenceLevel',
  SCENARIO_ASSESSMENT: 'ScenarioAssessment',

  // Capability entities - Action
  ADAPTATION_MEASURE: 'AdaptationMeasure',
  MITIGATION_MEASURE: 'MitigationMeasure',
  MANAGEMENT_ACTION: 'ManagementAction',
  EMERGENCY_RESPONSE: 'EmergencyResponse',
  RESOURCE_ALLOCATION: 'ResourceAllocation',
  ENGINEERING_MEASURE: 'EngineeringMeasure',
  POLICY_ACTION: 'PolicyAction',
  OPERATIONAL_PLAN: 'OperationalPlan',

  // World entities - Earth System
  EARTH_SYSTEM: 'EarthSystem',
  HYDROSPHERE: 'Hydrosphere',
  ATMOSPHERE: 'Atmosphere',
  BIOSPHERE: 'Biosphere',
  CRYOSPHERE: 'Cryosphere',
  LITHOSPHERE: 'Lithosphere',
  ANTHROPOSPHERE: 'Anthroposphere',

  // World entities - Earth Object
  EARTH_OBJECT: 'EarthObject',
  REGION: 'Region',
  BASIN: 'Basin',
  WATERSHED: 'Watershed',
  GLACIER: 'Glacier',
  LAKE: 'Lake',
  AQUIFER: 'Aquifer',
  COASTLINE: 'Coastline',
  MOUNTAIN_RANGE: 'MountainRange',

  // World entities - Earth Process
  EARTH_PROCESS: 'EarthProcess',
  WATER_CYCLE: 'WaterCycle',
  CARBON_CYCLE: 'CarbonCycle',
  EROSION: 'Erosion',
  SEDIMENTATION: 'Sedimentation',

  // World entities - Earth Variable
  EARTH_VARIABLE: 'EarthVariable',
  STREAMFLOW: 'Streamflow',
  PRECIPITATION: 'Precipitation',
  TEMPERATURE: 'Temperature',
  SOIL_MOISTURE: 'SoilMoisture',
  GROUNDWATER_LEVEL: 'GroundwaterLevel',
  EVAPOTRANSPIRATION: 'Evapotranspiration',

  // World entities - Resource
  RESOURCE_STOCK: 'ResourceStock',
  WATER_RESOURCE: 'WaterResource',
  ENERGY_RESOURCE: 'EnergyResource',
  RESOURCE_FLOW: 'ResourceFlow',
  WATER_WITHDRAWAL: 'WaterWithdrawal',

  // World entities - Hazard
  HAZARD: 'Hazard',
  FLOOD_EVENT: 'FloodEvent',
  DROUGHT_EVENT: 'DroughtEvent',
  HEATWAVE: 'Heatwave',
  WILDFIRE: 'Wildfire',
  LANDSLIDE: 'Landslide',

  // World entities - Risk
  EARTH_RISK: 'EarthRisk',
  FLOOD_RISK: 'FloodRisk',
  DROUGHT_RISK: 'DroughtRisk',
  EXPOSURE: 'Exposure',
  VULNERABILITY: 'Vulnerability',

  // World entities - Infrastructure
  INFRASTRUCTURE: 'Infrastructure',
  DAM: 'Dam',
  RESERVOIR: 'Reservoir',
  POWER_GRID: 'PowerGrid',
  WATER_SUPPLY_SYSTEM: 'WaterSupplySystem',

  // World entities - Human Activity
  HUMAN_ACTIVITY: 'HumanActivity',
  IRRIGATION: 'Irrigation',
  URBANIZATION: 'Urbanization',
  DEFORESTATION: 'Deforestation',

  // World entities - Scenario
  EARTH_SCENARIO: 'EarthScenario',
  CLIMATE_SCENARIO: 'ClimateScenario',
  DEVELOPMENT_SCENARIO: 'DevelopmentScenario',

  // World entities - Model Output
  MODEL_OUTPUT: 'ModelOutput',
  FORECAST: 'Forecast',
  PROJECTION: 'Projection',

  // World entities - Feedback
  FEEDBACK: 'Feedback',
  TELECONNECTION: 'Teleconnection',
  THRESHOLD: 'Threshold',

  // Domain entities - Hydrology
  RIVER: 'River',
  STREAM_REACH: 'StreamReach',
  GAUGE_STATION: 'GaugeStation',
  PRECIPITATION_GAUGE: 'PrecipitationGauge',
  HYDROLOGICAL_MODEL: 'HydrologicalModel',
  RAINFALL_RUNOFF_MODEL: 'RainfallRunoffModel',
  GROUNDWATER_MODEL: 'GroundwaterModel',
  RUNOFF_GENERATION: 'RunoffGeneration',
  INFILTRATION: 'Infiltration',
  FLASH_FLOOD: 'FlashFlood',
  RIVERINE_FLOOD: 'RiverineFlood',
  WATER_QUALITY_INDICATOR: 'WaterQualityIndicator',

  // Domain entities - Climate
  CLIMATE_ZONE: 'ClimateZone',
  CLIMATE_INDEX: 'ClimateIndex',
  ENSO: 'ENSO',
  CLIMATE_MODEL: 'ClimateModel',
  GCM: 'GCM',
  RCM: 'RCM',
  CLIMATE_PROJECTION: 'ClimateProjection',
  EXTREMES_INDICATOR: 'ExtremesIndicator',

  // Domain entities - Urban
  CITY: 'City',
  BUILDING: 'Building',
  DRAINAGE_NETWORK: 'DrainageNetwork',
  URBAN_FLOOD: 'UrbanFlood',
  TRAFFIC_FLOW: 'TrafficFlow',
  URBAN_HEAT_ISLAND: 'UrbanHeatIsland',

  // Domain entities - Energy
  SUBSTATION: 'Substation',
  TRANSMISSION_LINE: 'TransmissionLine',
  RENEWABLE_GENERATION: 'RenewableGeneration',
  ENERGY_STORAGE: 'EnergyStorage',
  ENERGY_DEMAND: 'EnergyDemand',
  HYDROPOWER_PLANT: 'HydropowerPlant',

  // Domain entities - Ecology
  ECOSYSTEM: 'Ecosystem',
  VEGETATION: 'Vegetation',
  HABITAT: 'Habitat',
  SPECIES: 'Species',
  BIODIVERSITY_INDEX: 'BiodiversityIndex',
  CARBON_SINK: 'CarbonSink',
  ECOSYSTEM_SERVICE: 'EcosystemService',

  // Domain entities - Agriculture
  CROP: 'Crop',
  CROP_YIELD: 'CropYield',
  IRRIGATION_DEMAND: 'IrrigationDemand',
  SOIL_CONDITION: 'SoilCondition',
  GROWING_SEASON: 'GrowingSeason',
  AGRICULTURAL_DROUGHT: 'AgriculturalDrought'
};

const LEGACY_RELATION_CONSTANTS = {
  // Foundation relations
  IS_A: 'is_a',
  HAS_PART: 'has_part',
  PART_OF: 'part_of',
  CONNECTED_TO: 'connected_to',
  CAUSES: 'causes',
  CAUSED_BY: 'caused_by',
  TRIGGERS: 'triggers',
  PRECEDES: 'precedes',
  FOLLOWS: 'follows',
  PERFORMS: 'performs',
  PERFORMED_BY: 'performed_by',
  TARGETS: 'targets',
  USES: 'uses',
  PRODUCES: 'produces',
  CONSUMES: 'consumes',
  CLAIMS: 'claims',
  SUPPORTS: 'supports',
  CONTRADICTS: 'contradicts',
  DERIVES_FROM: 'derives_from',
  APPLIES: 'applies',
  IMPLEMENTS: 'implements',
  EVALUATES: 'evaluates',
  EVALUATED_BY: 'evaluated_by',
  MEASURES: 'measures',
  MEASURED_BY: 'measured_by',
  LOCATED_AT: 'located_at',
  OCCURS_AT: 'occurs_at',
  DURING: 'during',
  RELATES_TO: 'relates_to',

  // Source relations
  CITED_BY: 'cited_by',
  CITES: 'cites',
  REFERENCES: 'references',
  VERSION_OF: 'version_of',
  DERIVED_FROM: 'derived_from',
  HAS_FIGURE: 'has_figure',
  HAS_SECTION: 'has_section',
  HAS_DATASET: 'has_dataset',
  DEPENDS_ON: 'depends_on',
  USES_PACKAGE: 'uses_package',
  HOSTED_ON: 'hosted_on',
  PUBLISHED_BY: 'published_by',
  REVIEWED_BY: 'reviewed_by',
  VALIDATED_BY: 'validated_by',

  // Capability relations
  HAS_VARIABLE: 'has_variable',
  HAS_COVERAGE: 'has_coverage',
  DERIVED_FROM_DATA: 'derived_from_data',
  OBSERVES: 'observes',
  OBSERVED_BY: 'observed_by',
  PART_OF_NETWORK: 'part_of_network',
  SIMULATES: 'simulates',
  TRAINED_ON: 'trained_on',
  VALIDATED_ON: 'validated_on',
  CALIBRATES_WITH: 'calibrated_with',
  IMPLEMENTS_METHOD: 'implements_method',
  DEPENDS_ON_SOFTWARE: 'depends_on_software',
  RUNS_ON: 'runs_on',
  ISSUED_BY: 'issued_by',
  APPLIES_TO: 'applies_to',
  IMPLEMENTS_POLICY: 'implements_policy',
  REPRESENTS: 'represents',
  EXPOSES: 'exposes',
  SUPPORTS_CLAIM: 'supports_claim',
  ASSESSED_BY: 'assessed_by',
  HAS_INDICATOR: 'has_indicator',
  TARGETS_ENTITY: 'targets_entity',
  RESPONDS_TO: 'responds_to',
  PLANNED_IN: 'planned_in',
  REDUCES_RISK: 'reduces_risk',

  // World relations
  DRAINS_TO: 'drains_to',
  UPSTREAM_OF: 'upstream_of',
  DOWNSTREAM_OF: 'downstream_of',
  FLOWS_THROUGH: 'flows_through',
  PART_OF_SYSTEM: 'part_of_system',
  INTERACTS_WITH: 'interacts_with',
  DRIVEN_BY: 'driven_by',
  AFFECTS: 'affects',
  MODIFIES: 'modifies',
  SUPPLIES: 'supplies',
  WITHDRAWS_FROM: 'withdraws_from',
  RECHARGES: 'recharges',
  TRIGGERS_HAZARD: 'triggers_hazard',
  EXACERBATES: 'exacerbates',
  MITIGATES_HAZARD: 'mitigates_hazard',
  EXPOSED_TO: 'exposed_to',
  VULNERABLE_TO: 'vulnerable_to',
  GENERATES_RISK: 'generates_risk',
  PROJECTS: 'projects',
  UNDER_SCENARIO: 'under_scenario',
  FEEDS_BACK: 'feeds_back',
  TELECONNECTED_TO: 'teleconnected_to',
  APPROACHES_THRESHOLD: 'approaches_threshold'
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Legacy exports (backward compatible)
  ENTITY_TYPES: Object.assign({}, ENTITY_TYPES, LEGACY_ENTITY_CONSTANTS),
  RELATION_TYPES: Object.assign({}, RELATION_TYPES, LEGACY_RELATION_CONSTANTS),
  ENTITY_SCHEMAS,
  validateEntityType,
  validateRelationType,
  validateEntityAttributes,
  getAllowedRelations,

  // New five-layer system exports
  getEntityLayer,
  getEntitiesByLayer,
  getEntitiesByCategory,
  getRelationsByCategory,
  getEntitySchema,
  getAllEntityTypes,
  getAllRelationTypes,
  registerDomainExtension,
  registerCustomExtension,
  resolveTypeName,
  getParentType,
  getTypeHierarchy,
  getOntologyStats,

  // Layer modules
  foundationOntology,
  sourceOntology,
  capabilityOntology,
  worldOntology,
  domainOntology,

  // Extension API
  OntologyExtension,
  ExtensionRegistry,
  getRegistry
};
