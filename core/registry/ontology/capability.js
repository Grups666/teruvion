/**
 * Layer 2: Capability Ontology
 * Describes the capabilities we use to understand, represent, monitor, simulate, assess, and govern Earth.
 *
 * This layer answers: "What capabilities do we have to build Digital Earth?"
 *
 * Key insight: Capabilities are NOT just algorithms. They include:
 * - Data capabilities (datasets, variables, coverage)
 * - Observation capabilities (sensors, satellites, gauges)
 * - Modeling capabilities (models, algorithms, simulations)
 * - Computing capabilities (software, APIs, workflows)
 * - Governance capabilities (policies, regulations, institutions)
 * - Socioeconomic capabilities (population, infrastructure, exposure)
 * - Evidence/Assessment capabilities (assessments, indicators, reports)
 * - Action/Intervention capabilities (measures, responses, plans)
 *
 * This layer is what allows non-Earth-science sources to contribute to Digital Earth.
 * A GNN algorithm repo → Modeling Capability
 * A policy report → Governance / Assessment / Action Capability
 * A population dataset → Socioeconomic Capability
 */

const foundation = require('./foundation');

// ============================================================================
// CAPABILITY ENTITY TYPES (8 categories, ~50 types)
// ============================================================================

const CAPABILITY_ENTITIES = {
  // ============================================================
  // CATEGORY 1: DATA CAPABILITY
  // Data resources for understanding Earth
  // ============================================================

  Dataset: {
    name: 'Dataset',
    extends: 'Data',
    layer: 'capability',
    category: 'data',
    description: 'A structured dataset for Earth analysis',
    additionalRequired: [],
    additionalOptional: [
      'acronym', 'version', 'doi', 'provider',
      'spatialCoverage', 'temporalCoverage', 'spatialResolution', 'temporalResolution',
      'variables', 'samples', 'citations', 'relatedDatasets',
      'quality', 'completeness', 'updateFrequency', 'accessMethod', 'license'
    ],
    additionalDefaults: { version: '1.0', samples: 0 }
  },

  DataProduct: {
    name: 'DataProduct',
    extends: 'Dataset',
    layer: 'capability',
    category: 'data',
    description: 'A derived data product from processing',
    additionalRequired: [],
    additionalOptional: [
      'processingLevel', 'sourceData', 'processingSteps',
      'validationStatus', 'uncertainty'
    ],
    additionalDefaults: { processingLevel: 'derived' }
  },

  Variable: {
    name: 'Variable',
    extends: 'Entity',
    layer: 'capability',
    category: 'data',
    description: 'A variable in a dataset',
    additionalRequired: ['name'],
    additionalOptional: [
      'units', 'dataType', 'dimensions', 'longName',
      'standardName', 'missingValue', 'range', 'description'
    ],
    additionalDefaults: {}
  },

  Feature: {
    name: 'Feature',
    extends: 'Entity',
    layer: 'capability',
    category: 'data',
    description: 'A feature used in modeling',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'importance', 'derivation', 'statistics',
      'missingHandling', 'normalization'
    ],
    additionalDefaults: {}
  },

  Coverage: {
    name: 'Coverage',
    extends: 'Entity',
    layer: 'capability',
    category: 'data',
    description: 'Spatial or temporal coverage specification',
    additionalRequired: ['type'],
    additionalOptional: [
      'bounds', 'resolution', 'crs', 'timeRange',
      'completeness', 'gaps'
    ],
    additionalDefaults: {}
  },

  Resolution: {
    name: 'Resolution',
    extends: 'Entity',
    layer: 'capability',
    category: 'data',
    description: 'Spatial or temporal resolution specification',
    additionalRequired: ['value', 'unit'],
    additionalOptional: ['type', 'nativeResolution', 'effectiveResolution'],
    additionalDefaults: {}
  },

  DataQuality: {
    name: 'DataQuality',
    extends: 'Entity',
    layer: 'capability',
    category: 'data',
    description: 'Quality metrics for data',
    additionalRequired: [],
    additionalOptional: [
      'completeness', 'accuracy', 'precision', 'consistency',
      'timeliness', 'validity', 'issues'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // CATEGORY 2: OBSERVATION CAPABILITY
  // Instruments and systems for observing Earth
  // ============================================================

  Sensor: {
    name: 'Sensor',
    extends: 'Entity',
    layer: 'capability',
    category: 'observation',
    description: 'A sensor for Earth observation',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'platform', 'variables', 'resolution',
      'swath', 'revisitTime', 'spectralBands', 'status'
    ],
    additionalDefaults: {}
  },

  Satellite: {
    name: 'Satellite',
    extends: 'Sensor',
    layer: 'capability',
    category: 'observation',
    description: 'An Earth observation satellite',
    additionalRequired: [],
    additionalOptional: [
      'orbit', 'launchDate', 'agency', 'instruments',
      'status', 'endDate'
    ],
    additionalDefaults: {}
  },

  Gauge: {
    name: 'Gauge',
    extends: 'Sensor',
    layer: 'capability',
    category: 'observation',
    description: 'An in-situ gauge or station',
    additionalRequired: ['stationId'],
    additionalOptional: [
      'type', 'location', 'river', 'basin',
      'drainageArea', 'elevation', 'operatingAgency',
      'startDate', 'endDate', 'variables', 'frequency'
    ],
    additionalDefaults: {}
  },

  Station: {
    name: 'Station',
    extends: 'Sensor',
    layer: 'capability',
    category: 'observation',
    description: 'A monitoring station',
    additionalRequired: ['stationId'],
    additionalOptional: [
      'type', 'location', 'network', 'variables',
      'operatingAgency', 'startDate', 'endDate'
    ],
    additionalDefaults: {}
  },

  RemoteSensingSystem: {
    name: 'RemoteSensingSystem',
    extends: 'Sensor',
    layer: 'capability',
    category: 'observation',
    description: 'A remote sensing system',
    additionalRequired: ['name'],
    additionalOptional: [
      'platform', 'sensors', 'coverage', 'resolution',
      'products', 'accessMethod'
    ],
    additionalDefaults: {}
  },

  InSituNetwork: {
    name: 'InSituNetwork',
    extends: 'Entity',
    layer: 'capability',
    category: 'observation',
    description: 'A network of in-situ sensors',
    additionalRequired: ['name'],
    additionalOptional: [
      'stations', 'variables', 'coverage', 'purpose',
      'operatingAgency', 'dataAccess'
    ],
    additionalDefaults: { stations: [] }
  },

  MonitoringProgram: {
    name: 'MonitoringProgram',
    extends: 'Process',
    layer: 'capability',
    category: 'observation',
    description: 'An Earth monitoring program',
    additionalRequired: ['name'],
    additionalOptional: [
      'sensors', 'variables', 'frequency', 'coverage',
      'objectives', 'duration', 'leadOrganization'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // CATEGORY 3: MODELING CAPABILITY
  // Models and algorithms for simulating Earth
  // ============================================================

  Model: {
    name: 'Model',
    extends: 'Method',
    layer: 'capability',
    category: 'modeling',
    description: 'A model for representing or simulating Earth processes',
    additionalRequired: [],
    additionalOptional: [
      'type', 'architecture', 'representation', 'assumptions',
      'validation', 'performance', 'limitations', 'domain'
    ],
    additionalDefaults: {}
  },

  Algorithm: {
    name: 'Algorithm',
    extends: 'Method',
    layer: 'capability',
    category: 'modeling',
    description: 'An algorithm for Earth analysis',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'complexity', 'inputs', 'outputs',
      'implementation', 'references'
    ],
    additionalDefaults: {}
  },

  Simulation: {
    name: 'Simulation',
    extends: 'Process',
    layer: 'capability',
    category: 'modeling',
    description: 'A simulation run',
    additionalRequired: ['name'],
    additionalOptional: [
      'model', 'configuration', 'inputs', 'outputs',
      'duration', 'resources', 'status'
    ],
    additionalDefaults: {}
  },

  Forecasting: {
    name: 'Forecasting',
    extends: 'Process',
    layer: 'capability',
    category: 'modeling',
    description: 'A forecasting system or process',
    additionalRequired: ['name'],
    additionalOptional: [
      'model', 'leadTime', 'variables', 'updateFrequency',
      'skill', 'uncertaintyMethod'
    ],
    additionalDefaults: {}
  },

  Calibration: {
    name: 'Calibration',
    extends: 'Process',
    layer: 'capability',
    category: 'modeling',
    description: 'A model calibration process',
    additionalRequired: [],
    additionalOptional: [
      'method', 'data', 'parameters', 'objective',
      'performance', 'period'
    ],
    additionalDefaults: {}
  },

  Validation: {
    name: 'Validation',
    extends: 'Process',
    layer: 'capability',
    category: 'modeling',
    description: 'A model validation process',
    additionalRequired: [],
    additionalOptional: [
      'method', 'data', 'metrics', 'period',
      'performance', 'limitations'
    ],
    additionalDefaults: {}
  },

  Benchmark: {
    name: 'Benchmark',
    extends: 'Entity',
    layer: 'capability',
    category: 'modeling',
    description: 'A benchmark for model evaluation',
    additionalRequired: ['name'],
    additionalOptional: [
      'metrics', 'baselines', 'leaderboard',
      'evaluationProtocol', 'splits', 'domain'
    ],
    additionalDefaults: {}
  },

  UncertaintyQuantification: {
    name: 'UncertaintyQuantification',
    extends: 'Method',
    layer: 'capability',
    category: 'modeling',
    description: 'A method for quantifying uncertainty',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'approach', 'assumptions', 'outputs',
      'computationalCost', 'references'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // CATEGORY 4: COMPUTING CAPABILITY
  // Software and infrastructure for Earth computing
  // ============================================================

  Software: {
    name: 'Software',
    extends: 'Entity',
    layer: 'capability',
    category: 'computing',
    description: 'Software for Earth analysis',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'language', 'license', 'repository',
      'documentation', 'version', 'dependencies'
    ],
    additionalDefaults: {}
  },

  Package: {
    name: 'Package',
    extends: 'Software',
    layer: 'capability',
    category: 'computing',
    description: 'A software package',
    additionalRequired: ['name', 'registry'],
    additionalOptional: [
      'version', 'dependencies', 'downloads', 'maintainers',
      'documentation'
    ],
    additionalDefaults: {}
  },

  API: {
    name: 'API',
    extends: 'Entity',
    layer: 'capability',
    category: 'computing',
    description: 'An API for accessing Earth data or services',
    additionalRequired: ['name'],
    additionalOptional: [
      'endpoints', 'authentication', 'rateLimits', 'examples',
      'documentation', 'status'
    ],
    additionalDefaults: {}
  },

  Workflow: {
    name: 'Workflow',
    extends: 'Process',
    layer: 'capability',
    category: 'computing',
    description: 'A computational workflow',
    additionalRequired: [],
    additionalOptional: [
      'steps', 'tools', 'dependencies', 'environment',
      'inputs', 'outputs', 'reproducibility'
    ],
    additionalDefaults: { steps: [], dependencies: [] }
  },

  Pipeline: {
    name: 'Pipeline',
    extends: 'Workflow',
    layer: 'capability',
    category: 'computing',
    description: 'A data processing pipeline',
    additionalRequired: [],
    additionalOptional: [
      'stages', 'automation', 'monitoring', 'errorHandling',
      'scheduling'
    ],
    additionalDefaults: {}
  },

  Interface: {
    name: 'Interface',
    extends: 'Entity',
    layer: 'capability',
    category: 'computing',
    description: 'A user or programmatic interface',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'platform', 'features', 'access',
      'documentation'
    ],
    additionalDefaults: {}
  },

  ExecutionEnvironment: {
    name: 'ExecutionEnvironment',
    extends: 'Entity',
    layer: 'capability',
    category: 'computing',
    description: 'An execution environment (container, VM, etc.)',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'specification', 'resources', 'baseImage',
      'dependencies', 'configuration'
    ],
    additionalDefaults: {}
  },

  CloudService: {
    name: 'CloudService',
    extends: 'Entity',
    layer: 'capability',
    category: 'computing',
    description: 'A cloud computing service',
    additionalRequired: ['name'],
    additionalOptional: [
      'provider', 'type', 'capabilities', 'pricing',
      'regions', 'documentation'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // CATEGORY 5: GOVERNANCE CAPABILITY
  // Policies, regulations, institutions for Earth governance
  // ============================================================

  Policy: {
    name: 'Policy',
    extends: 'Entity',
    layer: 'capability',
    category: 'governance',
    description: 'A policy for Earth resource management',
    additionalRequired: ['name'],
    additionalOptional: [
      'jurisdiction', 'type', 'objectives', 'instruments',
      'targetEntities', 'enforcement', 'effectiveness'
    ],
    additionalDefaults: {}
  },

  Regulation: {
    name: 'Regulation',
    extends: 'Policy',
    layer: 'capability',
    category: 'governance',
    description: 'A regulation or rule',
    additionalRequired: [],
    additionalOptional: [
      'issuingBody', 'effectiveDate', 'status',
      'requirements', 'penalties', 'compliance'
    ],
    additionalDefaults: { status: 'active' }
  },

  Institution: {
    name: 'Institution',
    extends: 'Agent',
    layer: 'capability',
    category: 'governance',
    description: 'An institution or organization',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'jurisdiction', 'mandate', 'members',
      'programs', 'budget', 'authority'
    ],
    additionalDefaults: {}
  },

  Stakeholder: {
    name: 'Stakeholder',
    extends: 'Agent',
    layer: 'capability',
    category: 'governance',
    description: 'A stakeholder in Earth governance',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'interests', 'influence', 'position',
      'engagement', 'resources'
    ],
    additionalDefaults: {}
  },

  ManagementPlan: {
    name: 'ManagementPlan',
    extends: 'Entity',
    layer: 'capability',
    category: 'governance',
    description: 'A management or action plan',
    additionalRequired: ['name'],
    additionalOptional: [
      'objectives', 'actions', 'timeline', 'responsibilities',
      'indicators', 'budget', 'status'
    ],
    additionalDefaults: {}
  },

  Standard: {
    name: 'Standard',
    extends: 'Entity',
    layer: 'capability',
    category: 'governance',
    description: 'A technical or management standard',
    additionalRequired: ['standardId'],
    additionalOptional: [
      'title', 'version', 'issuingBody', 'status',
      'requirements', 'complianceCriteria'
    ],
    additionalDefaults: {}
  },

  Protocol: {
    name: 'Protocol',
    extends: 'Method',
    layer: 'capability',
    category: 'governance',
    description: 'A protocol for procedures',
    additionalRequired: ['name'],
    additionalOptional: [
      'steps', 'requirements', 'certification', 'version'
    ],
    additionalDefaults: {}
  },

  Agreement: {
    name: 'Agreement',
    extends: 'Entity',
    layer: 'capability',
    category: 'governance',
    description: 'An international or multi-party agreement',
    additionalRequired: ['name'],
    additionalOptional: [
      'parties', 'effectiveDate', 'commitments',
      'implementation', 'monitoring', 'status'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // CATEGORY 6: SOCIOECONOMIC CAPABILITY
  // Population, infrastructure, exposure, vulnerability data
  // ============================================================

  PopulationDataset: {
    name: 'PopulationDataset',
    extends: 'Dataset',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'A population or demographic dataset',
    additionalRequired: [],
    additionalOptional: [
      'demographics', 'spatialResolution', 'temporalResolution',
      'methodology', 'source', 'uncertainty'
    ],
    additionalDefaults: {}
  },

  EconomicIndicator: {
    name: 'EconomicIndicator',
    extends: 'Metric',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'An economic indicator',
    additionalRequired: ['name', 'value'],
    additionalOptional: [
      'unit', 'year', 'source', 'methodology',
      'uncertainty', 'comparison'
    ],
    additionalDefaults: {}
  },

  LandUseClassification: {
    name: 'LandUseClassification',
    extends: 'Dataset',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'A land use / land cover classification',
    additionalRequired: [],
    additionalOptional: [
      'classes', 'resolution', 'methodology', 'accuracy',
      'temporalCoverage', 'changeDetection'
    ],
    additionalDefaults: {}
  },

  InfrastructureInventory: {
    name: 'InfrastructureInventory',
    extends: 'Dataset',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'An inventory of infrastructure assets',
    additionalRequired: [],
    additionalOptional: [
      'types', 'attributes', 'spatialResolution', 'completeness',
      'lastUpdate', 'sources'
    ],
    additionalDefaults: {}
  },

  ExposureDataset: {
    name: 'ExposureDataset',
    extends: 'Dataset',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'A dataset of exposed assets or populations',
    additionalRequired: [],
    additionalOptional: [
      'exposureType', 'valuation', 'resolution',
      'sectors', 'hazards', 'methodology'
    ],
    additionalDefaults: {}
  },

  VulnerabilityIndex: {
    name: 'VulnerabilityIndex',
    extends: 'Metric',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'A vulnerability index',
    additionalRequired: ['name', 'value'],
    additionalOptional: [
      'components', 'methodology', 'scale', 'uncertainty',
      'comparison', 'trends'
    ],
    additionalDefaults: {}
  },

  DemandModel: {
    name: 'DemandModel',
    extends: 'Model',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'A model for resource demand (water, energy, etc.)',
    additionalRequired: [],
    additionalOptional: [
      'demandType', 'drivers', 'sectors', 'projections',
      'uncertainty', 'validation'
    ],
    additionalDefaults: {}
  },

  BehaviorModel: {
    name: 'BehaviorModel',
    extends: 'Model',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'A model of human behavior',
    additionalRequired: [],
    additionalOptional: [
      'behaviorType', 'factors', 'validation', 'applications'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // CATEGORY 7: EVIDENCE / ASSESSMENT CAPABILITY
  // Evidence chains, assessments, indicators
  // ============================================================

  Assessment: {
    name: 'Assessment',
    extends: 'Process',
    layer: 'capability',
    category: 'evidence',
    description: 'An assessment process',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'scope', 'methodology', 'findings',
      'confidence', 'recommendations', 'participants'
    ],
    additionalDefaults: {}
  },

  Indicator: {
    name: 'Indicator',
    extends: 'Metric',
    layer: 'capability',
    category: 'evidence',
    description: 'An indicator for monitoring or assessment',
    additionalRequired: ['name', 'value'],
    additionalOptional: [
      'unit', 'baseline', 'target', 'trend',
      'threshold', 'methodology', 'data_source'
    ],
    additionalDefaults: {}
  },

  Index: {
    name: 'Index',
    extends: 'Indicator',
    layer: 'capability',
    category: 'evidence',
    description: 'A composite index',
    additionalRequired: [],
    additionalOptional: [
      'components', 'weighting', 'aggregation', 'scale'
    ],
    additionalDefaults: {}
  },

  EvidenceChain: {
    name: 'EvidenceChain',
    extends: 'Entity',
    layer: 'capability',
    category: 'evidence',
    description: 'A chain of evidence supporting a claim',
    additionalRequired: ['name'],
    additionalOptional: [
      'claim', 'evidence', 'confidence', 'gaps',
      'sources', 'assessment'
    ],
    additionalDefaults: {}
  },

  EvaluationFramework: {
    name: 'EvaluationFramework',
    extends: 'Method',
    layer: 'capability',
    category: 'evidence',
    description: 'A framework for evaluation',
    additionalRequired: ['name'],
    additionalOptional: [
      'criteria', 'methods', 'indicators', 'weights',
      'thresholds', 'documentation'
    ],
    additionalDefaults: {}
  },

  RiskAssessment: {
    name: 'RiskAssessment',
    extends: 'Assessment',
    layer: 'capability',
    category: 'evidence',
    description: 'A risk assessment',
    additionalRequired: [],
    additionalOptional: [
      'hazards', 'exposures', 'vulnerabilities', 'risks',
      'scenarios', 'confidence', 'recommendations'
    ],
    additionalDefaults: {}
  },

  ImpactAssessment: {
    name: 'ImpactAssessment',
    extends: 'Assessment',
    layer: 'capability',
    category: 'evidence',
    description: 'An impact assessment',
    additionalRequired: [],
    additionalOptional: [
      'intervention', 'impacts', 'attribution', 'uncertainty',
      'stakeholders', 'recommendations'
    ],
    additionalDefaults: {}
  },

  ConfidenceLevel: {
    name: 'ConfidenceLevel',
    extends: 'Entity',
    layer: 'capability',
    category: 'evidence',
    description: 'A confidence level for findings',
    additionalRequired: ['level'],
    additionalOptional: ['evidence', 'agreement', 'uncertainty'],
    additionalDefaults: {}
  },

  ScenarioAssessment: {
    name: 'ScenarioAssessment',
    extends: 'Assessment',
    layer: 'capability',
    category: 'evidence',
    description: 'An assessment under scenarios',
    additionalRequired: [],
    additionalOptional: [
      'scenarios', 'findings', 'comparisons', 'implications'
    ],
    additionalDefaults: {}
  },

  // ============================================================
  // CATEGORY 8: ACTION / INTERVENTION CAPABILITY
  // Measures, responses, plans for Earth action
  // ============================================================

  Intervention: {
    name: 'Intervention',
    extends: 'Action',
    layer: 'capability',
    category: 'action',
    description: 'An intervention to change Earth system state',
    additionalRequired: ['name'],
    additionalOptional: [
      'type', 'target', 'mechanism', 'effectiveness',
      'cost', 'sideEffects', 'implementation'
    ],
    additionalDefaults: {}
  },

  AdaptationMeasure: {
    name: 'AdaptationMeasure',
    extends: 'Intervention',
    layer: 'capability',
    category: 'action',
    description: 'An adaptation measure for climate change',
    additionalRequired: [],
    additionalOptional: [
      'hazard', 'sector', 'effectiveness', 'cost',
      'feasibility', 'coBenefits', 'barriers'
    ],
    additionalDefaults: {}
  },

  MitigationMeasure: {
    name: 'MitigationMeasure',
    extends: 'Intervention',
    layer: 'capability',
    category: 'action',
    description: 'A mitigation measure for emissions',
    additionalRequired: [],
    additionalOptional: [
      'sector', 'potential', 'cost', 'feasibility',
      'coBenefits', 'tradeoffs'
    ],
    additionalDefaults: {}
  },

  ManagementAction: {
    name: 'ManagementAction',
    extends: 'Intervention',
    layer: 'capability',
    category: 'action',
    description: 'A resource management action',
    additionalRequired: [],
    additionalOptional: [
      'resource', 'objective', 'method', 'timing',
      'duration', 'monitoring'
    ],
    additionalDefaults: {}
  },

  EmergencyResponse: {
    name: 'EmergencyResponse',
    extends: 'Intervention',
    layer: 'capability',
    category: 'action',
    description: 'An emergency response action',
    additionalRequired: [],
    additionalOptional: [
      'event', 'type', 'timing', 'resources',
      'effectiveness', 'lessons'
    ],
    additionalDefaults: {}
  },

  ResourceAllocation: {
    name: 'ResourceAllocation',
    extends: 'Action',
    layer: 'capability',
    category: 'action',
    description: 'A resource allocation decision',
    additionalRequired: ['resource'],
    additionalOptional: [
      'amount', 'recipient', 'purpose', 'conditions',
      'effectiveness', 'monitoring'
    ],
    additionalDefaults: {}
  },

  EngineeringMeasure: {
    name: 'EngineeringMeasure',
    extends: 'Intervention',
    layer: 'capability',
    category: 'action',
    description: 'An engineering intervention (dam, levee, etc.)',
    additionalRequired: [],
    additionalOptional: [
      'type', 'design', 'lifetime', 'cost',
      'effectiveness', 'impacts', 'maintenance'
    ],
    additionalDefaults: {}
  },

  PolicyAction: {
    name: 'PolicyAction',
    extends: 'Intervention',
    layer: 'capability',
    category: 'action',
    description: 'A policy action or implementation',
    additionalRequired: [],
    additionalOptional: [
      'policy', 'mechanism', 'target', 'implementation',
      'enforcement', 'effectiveness'
    ],
    additionalDefaults: {}
  },

  OperationalPlan: {
    name: 'OperationalPlan',
    extends: 'Entity',
    layer: 'capability',
    category: 'action',
    description: 'An operational plan for intervention',
    additionalRequired: ['name'],
    additionalOptional: [
      'objectives', 'actions', 'timeline', 'responsibilities',
      'resources', 'monitoring', 'triggers'
    ],
    additionalDefaults: {}
  }
};

// ============================================================================
// CAPABILITY RELATION TYPES
// ============================================================================

const CAPABILITY_RELATIONS = {
  // === Data Relations ===
  has_variable: {
    name: 'has_variable',
    layer: 'capability',
    category: 'data',
    description: 'Subject dataset has the object variable',
    domain: ['Dataset', 'DataProduct'],
    range: ['Variable']
  },

  has_coverage: {
    name: 'has_coverage',
    layer: 'capability',
    category: 'data',
    description: 'Subject has the object coverage',
    domain: ['Dataset', 'Model', 'Sensor'],
    range: ['Coverage']
  },

  derived_from_data: {
    name: 'derived_from_data',
    layer: 'capability',
    category: 'data',
    description: 'Subject is derived from the object data',
    domain: ['DataProduct', 'Dataset'],
    range: ['Dataset', 'Data']
  },

  // === Observation Relations ===
  observes: {
    name: 'observes',
    layer: 'capability',
    category: 'observation',
    description: 'Subject sensor observes the object',
    domain: ['Sensor', 'Satellite', 'Gauge', 'Station'],
    range: ['Variable', 'Entity', 'Location']
  },

  observed_by: {
    name: 'observed_by',
    layer: 'capability',
    category: 'observation',
    description: 'Subject is observed by the object sensor',
    domain: ['Variable', 'Entity', 'Location'],
    range: ['Sensor', 'Satellite', 'Gauge', 'Station']
  },

  part_of_network: {
    name: 'part_of_network',
    layer: 'capability',
    category: 'observation',
    description: 'Subject is part of the object network',
    domain: ['Sensor', 'Gauge', 'Station'],
    range: ['InSituNetwork', 'MonitoringProgram']
  },

  // === Modeling Relations ===
  simulates: {
    name: 'simulates',
    layer: 'capability',
    category: 'modeling',
    description: 'Subject model simulates the object',
    domain: ['Model', 'Simulation'],
    range: ['Process', 'Entity', 'System']
  },

  trained_on: {
    name: 'trained_on',
    layer: 'capability',
    category: 'modeling',
    description: 'Subject model was trained on the object data',
    domain: ['Model'],
    range: ['Dataset']
  },

  validated_on: {
    name: 'validated_on',
    layer: 'capability',
    category: 'modeling',
    description: 'Subject model was validated on the object data',
    domain: ['Model'],
    range: ['Dataset', 'Benchmark']
  },

  calibrated_with: {
    name: 'calibrated_with',
    layer: 'capability',
    category: 'modeling',
    description: 'Subject model was calibrated with the object data',
    domain: ['Model'],
    range: ['Dataset']
  },

  evaluated_by: {
    name: 'evaluated_by',
    layer: 'capability',
    category: 'modeling',
    description: 'Subject is evaluated by the object',
    domain: ['Model', 'Method'],
    range: ['Benchmark', 'Metric', 'Method']
  },

  // === Computing Relations ===
  implements_method: {
    name: 'implements_method',
    layer: 'capability',
    category: 'computing',
    description: 'Subject software implements the object method',
    domain: ['Software', 'Package', 'API'],
    range: ['Method', 'Model', 'Algorithm']
  },

  depends_on_software: {
    name: 'depends_on_software',
    layer: 'capability',
    category: 'computing',
    description: 'Subject depends on the object software',
    domain: ['Software', 'Workflow', 'Package'],
    range: ['Software', 'Package', 'API']
  },

  runs_on: {
    name: 'runs_on',
    layer: 'capability',
    category: 'computing',
    description: 'Subject runs on the object platform',
    domain: ['Workflow', 'Software'],
    range: ['CloudService', 'ExecutionEnvironment']
  },

  // === Governance Relations ===
  issued_by: {
    name: 'issued_by',
    layer: 'capability',
    category: 'governance',
    description: 'Subject is issued by the object institution',
    domain: ['Policy', 'Regulation', 'Standard'],
    range: ['Institution', 'Agent']
  },

  applies_to: {
    name: 'applies_to',
    layer: 'capability',
    category: 'governance',
    description: 'Subject policy applies to the object',
    domain: ['Policy', 'Regulation', 'Standard'],
    range: ['Entity', 'Process', 'Location']
  },

  implements_policy: {
    name: 'implements_policy',
    layer: 'capability',
    category: 'governance',
    description: 'Subject implements the object policy',
    domain: ['ManagementPlan', 'Protocol', 'Action'],
    range: ['Policy', 'Regulation']
  },

  // === Socioeconomic Relations ===
  represents: {
    name: 'represents',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'Subject represents the object',
    domain: ['ExposureDataset', 'VulnerabilityIndex', 'PopulationDataset'],
    range: ['Entity', 'Location', 'Population']
  },

  exposes: {
    name: 'exposes',
    layer: 'capability',
    category: 'socioeconomic',
    description: 'Subject exposes the object to hazard',
    domain: ['Location', 'InfrastructureInventory', 'PopulationDataset'],
    range: ['Hazard', 'Risk']
  },

  // === Evidence Relations ===
  supports_claim: {
    name: 'supports_claim',
    layer: 'capability',
    category: 'evidence',
    description: 'Subject evidence supports the object claim',
    domain: ['EvidenceChain', 'Dataset', 'Assessment'],
    range: ['Claim']
  },

  assessed_by: {
    name: 'assessed_by',
    layer: 'capability',
    category: 'evidence',
    description: 'Subject is assessed by the object',
    domain: ['Entity', 'Location', 'Risk'],
    range: ['Assessment', 'EvaluationFramework']
  },

  has_indicator: {
    name: 'has_indicator',
    layer: 'capability',
    category: 'evidence',
    description: 'Subject has the object as indicator',
    domain: ['Assessment', 'Location', 'Entity'],
    range: ['Indicator', 'Index']
  },

  // === Action Relations ===
  targets_entity: {
    name: 'targets_entity',
    layer: 'capability',
    category: 'action',
    description: 'Subject intervention targets the object',
    domain: ['Intervention', 'Action'],
    range: ['Entity', 'Location', 'Risk', 'Process']
  },

  responds_to: {
    name: 'responds_to',
    layer: 'capability',
    category: 'action',
    description: 'Subject responds to the object event/risk',
    domain: ['EmergencyResponse', 'Intervention'],
    range: ['Event', 'Risk', 'Hazard']
  },

  planned_in: {
    name: 'planned_in',
    layer: 'capability',
    category: 'action',
    description: 'Subject action is planned in the object plan',
    domain: ['Intervention', 'Action'],
    range: ['OperationalPlan', 'ManagementPlan']
  },

  reduces_risk: {
    name: 'reduces_risk',
    layer: 'capability',
    category: 'action',
    description: 'Subject intervention reduces the object risk',
    domain: ['Intervention', 'EngineeringMeasure'],
    range: ['Risk', 'Hazard']
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getMergedSchema(typeName) {
  const capDef = CAPABILITY_ENTITIES[typeName];
  if (!capDef) return null;

  // Get parent schema from foundation
  let parentSchema = foundation.getEntitySchema(capDef.extends);
  if (!parentSchema) {
    // Check if parent is another capability type
    const parentDef = CAPABILITY_ENTITIES[capDef.extends];
    if (parentDef) {
      parentSchema = getMergedSchema(capDef.extends);
    }
  }

  if (!parentSchema) {
    return {
      name: typeName,
      extends: capDef.extends,
      layer: 'capability',
      category: capDef.category,
      description: capDef.description,
      required: [...capDef.additionalRequired],
      optional: [...capDef.additionalOptional],
      defaults: { ...capDef.additionalDefaults }
    };
  }

  return {
    name: typeName,
    extends: capDef.extends,
    layer: 'capability',
    category: capDef.category,
    description: capDef.description,
    required: [...parentSchema.required, ...capDef.additionalRequired],
    optional: [...parentSchema.optional, ...capDef.additionalOptional],
    defaults: { ...parentSchema.defaults, ...capDef.additionalDefaults }
  };
}

function getCapabilityTypeNames() {
  return Object.keys(CAPABILITY_ENTITIES);
}

function isCapabilityType(typeName) {
  return CAPABILITY_ENTITIES.hasOwnProperty(typeName);
}

function getParentType(typeName) {
  const def = CAPABILITY_ENTITIES[typeName];
  return def ? def.extends : null;
}

function getCapabilityTypesByCategory() {
  const categories = {};
  for (const [key, def] of Object.entries(CAPABILITY_ENTITIES)) {
    const cat = def.category;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(def.name);
  }
  return categories;
}

function validateCapabilityType(type) {
  return Object.values(CAPABILITY_ENTITIES).some(d => d.name === type);
}

module.exports = {
  CAPABILITY_ENTITIES,
  CAPABILITY_RELATIONS,
  getMergedSchema,
  getCapabilityTypeNames,
  isCapabilityType,
  getParentType,
  getCapabilityTypesByCategory,
  validateCapabilityType
};
