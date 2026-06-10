/**
 * Relation Semantics for Digital Earth
 *
 * This file defines precise semantics for bridge relations between:
 * - Capability objects (Dataset, Model, Sensor, Policy, Intervention, etc.)
 * - World objects (Basin, Region, Hazard, Risk, EarthVariable, etc.)
 *
 * Key principles:
 * 1. Relations must be verifiable from source text
 * 2. Each relation has domain/range constraints
 * 3. Relations are classified by evidence strength
 * 4. Fallback relations are clearly marked
 */

// ============================================================================
// BRIDGE RELATION SEMANTICS
// ============================================================================

/**
 * Bridge relations connect Capability layer to World layer
 * These are the most important relations for Digital Earth object graph
 */
const BRIDGE_RELATION_SEMANTICS = {
  // === Coverage/Spatial Relations ===

  covers: {
    name: 'covers',
    description: 'Subject (Dataset/Sensor) covers the spatial extent of object (Region/Basin)',
    domain: ['Dataset', 'DataProduct', 'Sensor', 'Satellite', 'Model'],
    range: ['Region', 'Basin', 'Watershed', 'Location', 'Glacier', 'Lake'],
    inverse: 'covered_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['spatial extent mention', 'coverage description'],
      optional: ['bbox', 'centroid', 'area']
    },
    validationRules: [
      'Subject must have spatial coverage defined or implied',
      'Object must be a spatial entity',
      'Coverage should be verifiable from source text'
    ],
    examples: [
      { subject: 'ERA5-Land', object: 'Europe', evidence: 'ERA5-Land covers Europe at 9km resolution' },
      { subject: 'CAMELS dataset', object: 'CONUS', evidence: 'CAMELS contains 671 catchments in CONUS' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.6,
      note: 'Inferred from Dataset + Region proximity. Requires source text verification.'
    }
  },

  // === Observation Relations ===

  observes: {
    name: 'observes',
    description: 'Subject (Sensor/Satellite) observes the object (EarthVariable/Phenomenon)',
    domain: ['Sensor', 'Satellite', 'Gauge', 'Station', 'RemoteSensingSystem', 'InSituNetwork'],
    range: ['EarthVariable', 'Streamflow', 'Precipitation', 'Temperature', 'SoilMoisture', 'Entity'],
    inverse: 'observed_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['what is measured/observed'],
      optional: ['measurement frequency', 'accuracy', 'units']
    },
    validationRules: [
      'Subject must be an observation instrument or system',
      'Object must be an observable entity',
      'There should be evidence of what is being measured'
    ],
    examples: [
      { subject: 'GRACE satellite', object: 'GroundwaterLevel', evidence: 'GRACE measures groundwater storage changes' },
      { subject: 'Stream gauge', object: 'Streamflow', evidence: 'The gauge measures river discharge' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.65,
      note: 'Inferred from Sensor + EarthVariable type. Verify measurement purpose in source.'
    }
  },

  measures: {
    name: 'measures',
    description: 'Subject (Sensor/Gauge) measures a specific quantity of object',
    domain: ['Sensor', 'Gauge', 'Station', 'Instrument'],
    range: ['EarthVariable', 'Metric', 'Entity'],
    inverse: 'measured_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['specific variable being measured'],
      optional: ['measurement method', 'precision', 'units']
    },
    validationRules: [
      'More specific than observes - indicates direct measurement',
      'Should have clear evidence of measurement purpose'
    ],
    examples: [
      { subject: 'Rain gauge', object: 'Precipitation', evidence: 'Rain gauges measure precipitation amount' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'measures requires explicit evidence - no fallback allowed'
    }
  },

  // === Modeling Relations ===

  simulates: {
    name: 'simulates',
    description: 'Subject (Model) simulates the behavior of object (Process/System/Region)',
    domain: ['Model', 'Simulation', 'HydrologicalModel', 'ClimateModel'],
    range: ['EarthProcess', 'Basin', 'Watershed', 'System', 'EarthVariable'],
    inverse: 'simulated_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['model purpose', 'what is simulated'],
      optional: ['model type', 'validation', 'performance']
    },
    validationRules: [
      'Subject must be a model or simulation',
      'Object must be simulatable (process, system, region)',
      'Evidence should show model actually simulates this target'
    ],
    examples: [
      { subject: 'LSTM model', object: 'Yangtze Basin', evidence: 'The LSTM model simulates streamflow in the Yangtze River Basin' },
      { subject: 'GloFAS', object: 'global flood events', evidence: 'GloFAS simulates flood events globally' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.65,
      note: 'Inferred from Model + Basin proximity. Check if model actually simulates this basin.'
    }
  },

  predicts: {
    name: 'predicts',
    description: 'Subject (Model/Method) predicts the object (Variable/Event)',
    domain: ['Model', 'Forecasting', 'Method'],
    range: ['EarthVariable', 'Event', 'Hazard', 'TimeSeries'],
    inverse: 'predicted_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['prediction target', 'forecast horizon'],
      optional: ['lead time', 'accuracy', 'methodology']
    },
    validationRules: [
      'Implies future-oriented simulation',
      'Should have evidence of prediction purpose'
    ],
    examples: [
      { subject: 'Flood forecasting model', object: 'flood peak timing', evidence: 'The model predicts flood peak timing 7 days ahead' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'predicts requires explicit evidence of forecasting purpose'
    }
  },

  models: {
    name: 'models',
    description: 'Subject (Model/Method) models the object (Process/Phenomenon)',
    domain: ['Model', 'Method', 'Algorithm'],
    range: ['EarthProcess', 'EarthVariable', 'System', 'Phenomenon'],
    inverse: 'modeled_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['what is modeled'],
      optional: ['modeling approach', 'assumptions']
    },
    validationRules: [
      'General modeling relation - less specific than simulates',
      'Can apply to conceptual or mathematical models'
    ],
    examples: [
      { subject: 'Rainfall-runoff model', object: 'WaterCycle', evidence: 'The model represents the rainfall-runoff process' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.6,
      note: 'Inferred from Model + Process. Verify modeling purpose in source.'
    }
  },

  // === Data-Variable Relations ===

  has_variable: {
    name: 'has_variable',
    description: 'Subject (Dataset) contains the object variable',
    domain: ['Dataset', 'DataProduct', 'ModelOutput'],
    range: ['Variable', 'EarthVariable', 'Streamflow', 'Precipitation', 'Temperature'],
    inverse: 'in_dataset',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['variable name', 'variable description'],
      optional: ['units', 'temporal resolution', 'spatial resolution']
    },
    validationRules: [
      'Dataset must contain the variable',
      'Variable should be explicitly listed or described'
    ],
    examples: [
      { subject: 'ERA5-Land', object: 'SoilMoisture', evidence: 'ERA5-Land includes soil moisture at multiple depths' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'Variable presence must be verified from dataset documentation'
    }
  },

  represents: {
    name: 'represents',
    description: 'Subject (Dataset/Model) represents the object in the real world',
    domain: ['Dataset', 'DataProduct', 'Model', 'ExposureDataset', 'VulnerabilityIndex'],
    range: ['Entity', 'Location', 'Population', 'Infrastructure', 'EarthVariable'],
    inverse: 'represented_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['what is represented'],
      optional: ['representation fidelity', 'limitations']
    },
    validationRules: [
      'Subject should have explicit purpose of representing the object',
      'May indicate abstraction or approximation'
    ],
    examples: [
      { subject: 'Population dataset', object: 'exposed population', evidence: 'The dataset represents population exposed to flood risk' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.55,
      note: 'Inferred from Dataset type. Verify representation purpose in source.'
    }
  },

  // === Intervention/Action Relations ===

  mitigates: {
    name: 'mitigates',
    description: 'Subject (Intervention/Infrastructure) mitigates the object (Risk/Hazard)',
    domain: ['Intervention', 'AdaptationMeasure', 'MitigationMeasure', 'Infrastructure', 'EngineeringMeasure'],
    range: ['EarthRisk', 'FloodRisk', 'DroughtRisk', 'Hazard'],
    inverse: 'mitigated_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['intervention purpose', 'target risk/hazard'],
      optional: ['effectiveness', 'implementation status']
    },
    validationRules: [
      'Subject must be an intervention or protective infrastructure',
      'Object must be a risk or hazard',
      'Should have evidence of mitigation purpose'
    ],
    examples: [
      { subject: 'Flood early warning system', object: 'FloodRisk', evidence: 'The early warning system mitigates flood risk by providing advance notice' },
      { subject: 'Dam', object: 'flood damage', evidence: 'The dam reduces flood damage downstream' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.55,
      note: 'Inferred from Intervention + Risk types. Verify mitigation purpose in source.'
    }
  },

  targets: {
    name: 'targets',
    description: 'Subject (Intervention/Policy) targets the object (Entity/Location/Risk)',
    domain: ['Intervention', 'AdaptationMeasure', 'Policy', 'ManagementAction'],
    range: ['Entity', 'Location', 'Risk', 'Hazard', 'Population'],
    inverse: 'targeted_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['target specification'],
      optional: ['target criteria', 'selection rationale']
    },
    validationRules: [
      'Target should be explicitly stated',
      'May be geographic, demographic, or risk-based targeting'
    ],
    examples: [
      { subject: 'Drought response plan', object: 'agricultural sector', evidence: 'The plan targets the agricultural sector with water allocation measures' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'Targeting must be explicitly stated - no fallback'
    }
  },

  responds_to: {
    name: 'responds_to',
    description: 'Subject (EmergencyResponse/Action) responds to the object (Event/Hazard)',
    domain: ['EmergencyResponse', 'Intervention', 'Action'],
    range: ['Event', 'Hazard', 'FloodEvent', 'DroughtEvent', 'Risk'],
    inverse: 'responded_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['event being responded to'],
      optional: ['response timing', 'response type']
    },
    validationRules: [
      'Should have clear evidence of response action',
      'Event being responded to should be identifiable'
    ],
    examples: [
      { subject: 'Emergency evacuation', object: 'FloodEvent', evidence: 'Emergency evacuation was triggered by the flood event' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'Response relationship requires explicit evidence'
    }
  },

  // === Governance Relations ===

  governs: {
    name: 'governs',
    description: 'Subject (Policy/Regulation) governs the object (Entity/Process/Location)',
    domain: ['Policy', 'Regulation', 'Standard', 'Agreement'],
    range: ['Entity', 'Process', 'Location', 'Activity'],
    inverse: 'governed_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['scope of governance'],
      optional: ['jurisdiction', 'enforcement mechanism']
    },
    validationRules: [
      'Policy scope should be defined',
      'Jurisdiction should be identifiable'
    ],
    examples: [
      { subject: 'EU Water Framework Directive', object: 'river basin management', evidence: 'The directive governs river basin management across EU member states' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.6,
      note: 'Inferred from Policy type. Verify governance scope in source.'
    }
  },

  assesses: {
    name: 'assesses',
    description: 'Subject (Assessment/Indicator) assesses the object (Risk/Status/Condition)',
    domain: ['Assessment', 'RiskAssessment', 'ImpactAssessment', 'Indicator', 'Index'],
    range: ['Risk', 'Entity', 'Location', 'Condition', 'Status'],
    inverse: 'assessed_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['what is assessed', 'assessment criteria'],
      optional: ['methodology', 'data sources', 'confidence']
    },
    validationRules: [
      'Assessment subject and object should be clear',
      'Methodology should be described'
    ],
    examples: [
      { subject: 'Flood risk assessment', object: 'coastal cities', evidence: 'The assessment evaluates flood risk for 50 coastal cities' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.6,
      note: 'Inferred from Assessment type. Verify assessment target in source.'
    }
  },

  // === Evidence/Support Relations ===

  supports: {
    name: 'supports',
    description: 'Subject (Evidence/Data) supports the object (Claim/Conclusion)',
    domain: ['Evidence', 'Data', 'Dataset', 'Measurement', 'Result'],
    range: ['Claim', 'Conclusion', 'Hypothesis'],
    inverse: 'supported_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['how evidence supports claim'],
      optional: ['support strength', 'limitations']
    },
    validationRules: [
      'Support relationship should be explicit',
      'May indicate partial or full support'
    ],
    examples: [
      { subject: 'Figure 3 results', object: 'model accuracy claim', evidence: 'Figure 3 shows the model achieves 0.85 NSE, supporting the accuracy claim' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'Support relationship requires explicit evidence'
    }
  },

  contradicts: {
    name: 'contradicts',
    description: 'Subject (Evidence/Data) contradicts the object (Claim/Assumption)',
    domain: ['Evidence', 'Data', 'Result', 'Observation'],
    range: ['Claim', 'Hypothesis', 'Assumption'],
    inverse: 'contradicted_by',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['how evidence contradicts claim'],
      optional: ['contradiction strength', 'alternative explanation']
    },
    validationRules: [
      'Contradiction should be clearly stated',
      'Important for scientific integrity'
    ],
    examples: [
      { subject: 'validation results', object: 'linear assumption', evidence: 'The validation contradicts the linear assumption, showing nonlinear behavior' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'Contradiction relationship requires explicit evidence'
    }
  },

  // === Transfer/Applicability Relations ===

  applicable_to: {
    name: 'applicable_to',
    description: 'Subject (Method/Model) is applicable to the object (Domain/Task/Region)',
    domain: ['Method', 'Model', 'Algorithm', 'Dataset'],
    range: ['Domain', 'Task', 'Region', 'Process'],
    inverse: 'can_apply',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['applicability statement'],
      optional: ['limitations', 'conditions']
    },
    validationRules: [
      'Applicability should be discussed in source',
      'May indicate transfer potential'
    ],
    examples: [
      { subject: 'GNN method', object: 'spatial network analysis', evidence: 'The GNN method is applicable to spatial network analysis tasks' }
    ],
    fallbackConditions: {
      allowed: true,
      requiresVerification: true,
      confidenceCap: 0.5,
      note: 'Inferred from method type. Verify applicability in source.'
    }
  },

  transferable_to: {
    name: 'transferable_to',
    description: 'Subject (Method/Model) can be transferred to object (Domain/Application)',
    domain: ['Method', 'Model', 'Algorithm'],
    range: ['Domain', 'Task', 'Application', 'Region'],
    inverse: 'transferable_from',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['transfer potential discussion'],
      optional: ['transfer requirements', 'adaptations needed']
    },
    validationRules: [
      'Should indicate potential for domain adaptation',
      'Key for identifying transfer capability sources'
    ],
    examples: [
      { subject: 'Traffic prediction GNN', object: 'river network modeling', evidence: 'The GNN architecture for traffic prediction is transferable to river network modeling due to similar graph structure' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'Transfer potential requires LLM assessment, not rule-based inference'
    }
  },

  // === Limitation Relations ===

  limited_by: {
    name: 'limited_by',
    description: 'Subject has limitations related to the object',
    domain: ['Model', 'Method', 'Dataset', 'Assessment'],
    range: ['Condition', 'Assumption', 'DataAvailability', 'Resource'],
    inverse: 'limits',
    cardinality: 'many-to-many',
    evidenceRequirements: {
      required: ['limitation description'],
      optional: ['impact', 'mitigation']
    },
    validationRules: [
      'Limitation should be explicitly discussed',
      'Important for honest knowledge representation'
    ],
    examples: [
      { subject: 'ERA5-Land', object: 'data availability before 1950', evidence: 'ERA5-Land is limited by data availability before 1950' }
    ],
    fallbackConditions: {
      allowed: false,
      note: 'Limitations must be explicitly stated in source'
    }
  }
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a bridge relation against semantics
 */
function validateRelation(relationType, subjectType, objectType, options = {}) {
  const semantics = BRIDGE_RELATION_SEMANTICS[relationType];

  if (!semantics) {
    return {
      valid: false,
      reason: `Unknown relation type: ${relationType}`,
      suggestion: 'Check relation type against BRIDGE_RELATION_SEMANTICS'
    };
  }

  // Check domain constraint
  const domainValid = semantics.domain.some(d =>
    subjectType === d || isSubtypeOf(subjectType, d)
  );

  if (!domainValid) {
    return {
      valid: false,
      reason: `Subject type '${subjectType}' not in domain of '${relationType}'`,
      allowedDomains: semantics.domain
    };
  }

  // Check range constraint
  const rangeValid = semantics.range.some(r =>
    objectType === r || isSubtypeOf(objectType, r)
  );

  if (!rangeValid) {
    return {
      valid: false,
      reason: `Object type '${objectType}' not in range of '${relationType}'`,
      allowedRanges: semantics.range
    };
  }

  return {
    valid: true,
    semantics,
    fallbackAllowed: semantics.fallbackConditions?.allowed || false,
    requiresVerification: semantics.fallbackConditions?.requiresVerification || false
  };
}

/**
 * Check if a type is a subtype of another (simplified)
 */
function isSubtypeOf(type, parentType) {
  // Basic inheritance check - would need full ontology integration
  const subtypeMap = {
    'HydrologicalModel': ['Model'],
    'ClimateModel': ['Model'],
    'FloodEvent': ['Hazard', 'Event'],
    'DroughtEvent': ['Hazard', 'Event'],
    'Streamflow': ['EarthVariable'],
    'Precipitation': ['EarthVariable'],
    'Temperature': ['EarthVariable'],
    'SoilMoisture': ['EarthVariable'],
    'FloodRisk': ['EarthRisk', 'Risk'],
    'DroughtRisk': ['EarthRisk', 'Risk']
  };

  if (subtypeMap[type]?.includes(parentType)) {
    return true;
  }

  return type === parentType;
}

/**
 * Get confidence cap for a relation based on evidence
 */
function getConfidenceCap(relationType, hasSourceEvidence) {
  const semantics = BRIDGE_RELATION_SEMANTICS[relationType];

  if (!semantics) return 0.5;

  if (hasSourceEvidence) {
    return 0.9; // High confidence with evidence
  }

  if (semantics.fallbackConditions?.allowed) {
    return semantics.fallbackConditions.confidenceCap || 0.6;
  }

  return 0; // Fallback not allowed
}

/**
 * Get all valid relations between subject and object types
 */
function getValidRelations(subjectType, objectType) {
  const validRelations = [];

  for (const [relType, semantics] of Object.entries(BRIDGE_RELATION_SEMANTICS)) {
    const validation = validateRelation(relType, subjectType, objectType);
    if (validation.valid) {
      validRelations.push({
        type: relType,
        description: semantics.description,
        fallbackAllowed: semantics.fallbackConditions?.allowed || false
      });
    }
  }

  return validRelations;
}

module.exports = {
  BRIDGE_RELATION_SEMANTICS,
  validateRelation,
  isSubtypeOf,
  getConfidenceCap,
  getValidRelations
};
