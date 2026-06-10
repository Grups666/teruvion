/**
 * TripleStore - Knowledge Graph Storage
 * Stores entities and triples (subject-predicate-object)
 * Supports indexing and querying
 */

const fs = require('fs').promises;
const path = require('path');
const { validateEntityType, validateRelationType, validateEntityAttributes } = require('./ontology');

// ============================================================================
// VERIFICATION STATES
// ============================================================================

const VERIFICATION_STATES = {
  EXTRACTED: 'extracted',    // AI extracted, not reviewed
  REVIEWED: 'reviewed',      // Human reviewed, pending verification
  VERIFIED: 'verified',      // Confirmed as correct
  UNCERTAIN: 'uncertain',    // Marked as uncertain/questionable
  REJECTED: 'rejected'       // Rejected as incorrect
};

// ============================================================================
// ENTITY CLASS
// ============================================================================

class Entity {
  constructor(type, attributes = {}, metadata = {}) {
    validateEntityType(type);
    validateEntityAttributes(type, attributes);

    this.id = metadata.id || generateId(type);
    this.type = type;
    this.attributes = attributes;
    this.createdAt = new Date().toISOString();
    this.metadata = {
      confidence: metadata.confidence || 1.0,
      source: metadata.source || 'manual',
      extractedBy: metadata.extractedBy || 'user',
      ...metadata
    };

    // Verification state (new in v0.1)
    this.verificationState = metadata.verificationState || VERIFICATION_STATES.EXTRACTED;
    this.reviewedBy = metadata.reviewedBy || null;
    this.reviewedAt = metadata.reviewedAt || null;
    this.notes = metadata.notes || [];
  }

  // Get display name for this entity
  getDisplayName() {
    return this.attributes.name ||
           this.attributes.title ||
           this.attributes.statement ||
           this.attributes.text ||
           this.id;
  }

  // Verify this entity
  verify(state, reviewer, note = null) {
    if (!Object.values(VERIFICATION_STATES).includes(state)) {
      throw new Error(`Invalid verification state: ${state}`);
    }

    this.verificationState = state;
    this.reviewedBy = reviewer;
    this.reviewedAt = new Date().toISOString();

    if (note) {
      this.notes.push({
        text: note,
        by: reviewer,
        at: this.reviewedAt
      });
    }
  }
}

// ============================================================================
// TRIPLE CLASS
// ============================================================================

class Triple {
  constructor(subject, predicate, object, metadata = {}) {
    validateRelationType(predicate);

    this.id = generateId('triple');
    this.subject = subject;      // Entity ID
    this.predicate = predicate;  // Relation type
    this.object = object;        // Entity ID or literal value
    this.metadata = {
      confidence: metadata.confidence || 1.0,
      source: metadata.source,
      extractedBy: metadata.extractedBy,
      timestamp: new Date().toISOString(),
      ...metadata
    };

    // Verification state (new in v0.1)
    this.verificationState = metadata.verificationState || VERIFICATION_STATES.EXTRACTED;
    this.reviewedBy = metadata.reviewedBy || null;
    this.reviewedAt = metadata.reviewedAt || null;
    this.notes = metadata.notes || [];
  }

  // Verify this triple
  verify(state, reviewer, note = null) {
    if (!Object.values(VERIFICATION_STATES).includes(state)) {
      throw new Error(`Invalid verification state: ${state}`);
    }

    this.verificationState = state;
    this.reviewedBy = reviewer;
    this.reviewedAt = new Date().toISOString();

    if (note) {
      this.notes.push({
        text: note,
        by: reviewer,
        at: this.reviewedAt
      });
    }
  }
}

// ============================================================================
// TRIPLE STORE CLASS
// ============================================================================

class TripleStore {
  constructor(storagePath = null) {
    this.entities = new Map();    // id -> Entity
    this.triples = [];            // Array of Triples
    this.indexes = {
      spo: new Map(),  // subject -> predicate -> [objects]
      pos: new Map(),  // predicate -> object -> [subjects]
      ops: new Map(),  // object -> predicate -> [subjects]
      typeIndex: new Map()  // type -> [entity ids]
    };
    this.storagePath = storagePath || path.join(__dirname, '../../_local/registry.json');
  }

  // ==========================================================================
  // ENTITY METHODS
  // ==========================================================================

  /**
   * Add an entity to the store
   */
  addEntity(entity) {
    if (!(entity instanceof Entity)) {
      throw new Error('Must provide Entity instance');
    }

    this.entities.set(entity.id, entity);

    // Update type index
    if (!this.indexes.typeIndex.has(entity.type)) {
      this.indexes.typeIndex.set(entity.type, []);
    }
    this.indexes.typeIndex.get(entity.type).push(entity.id);

    return entity.id;
  }

  /**
   * Get entity by ID
   */
  getEntity(id) {
    return this.entities.get(id);
  }

  /**
   * Get all entities of a type
   */
  getEntitiesByType(type) {
    const ids = this.indexes.typeIndex.get(type) || [];
    return ids.map(id => this.entities.get(id)).filter(Boolean);
  }

  /**
   * Check if entity exists
   */
  hasEntity(id) {
    return this.entities.has(id);
  }

  // ==========================================================================
  // TRIPLE METHODS
  // ==========================================================================

  /**
   * Add a triple
   */
  addTriple(subject, predicate, object, metadata = {}) {
    // Validate subject exists
    if (!this.hasEntity(subject)) {
      throw new Error(`Subject entity ${subject} does not exist`);
    }

    // Validate object exists (if it's an entity reference)
    // Check against known entity ID prefixes
    const entityPrefixes = ['src-', 'ent-', 'claim-', 'ev-', 'data-', 'method-',
                            'proc-', 'evt-', 'sys-', 'loc-', 'time-', 'result-',
                            'metric-', 'unc-', 'paper-', 'code-', 'dataset-',
                            'report-', 'news-', 'rq-', 'hypo-', 'theory-',
                            'model-', 'exp-', 'fig-', 'region-', 'trange-', 'wf-',
                            'basin-', 'wshed-', 'gauge-', 'flow-', 'flood-',
                            'hydro-', 'nn-', 'train-', 'bench-', 'ckpt-',
                            'inst-', 'reg-', 'stake-', 'impact-'];

    const isEntityObject = typeof object === 'string' &&
                           entityPrefixes.some(prefix => object.startsWith(prefix));

    if (isEntityObject && !this.hasEntity(object)) {
      throw new Error(`Object entity ${object} does not exist`);
    }

    const triple = new Triple(subject, predicate, object, metadata);
    this.triples.push(triple);
    this._indexTriple(triple);

    return triple.id;
  }

  /**
   * Get all triples
   */
  getAllTriples() {
    return this.triples;
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  /**
   * Query: Given subject and predicate, find objects
   */
  query(subject, predicate = null) {
    if (!this.indexes.spo.has(subject)) {
      return [];
    }

    if (predicate === null) {
      // Return all predicates and their objects
      const result = [];
      const predicates = this.indexes.spo.get(subject);
      for (const [pred, objects] of predicates.entries()) {
        objects.forEach(obj => result.push({ predicate: pred, object: obj }));
      }
      return result;
    }

    const predicates = this.indexes.spo.get(subject);
    if (!predicates.has(predicate)) {
      return [];
    }

    return predicates.get(predicate);
  }

  /**
   * Query inverse: Given predicate and object, find subjects
   */
  queryInverse(predicate, object = null) {
    if (!this.indexes.pos.has(predicate)) {
      return [];
    }

    if (object === null) {
      // Return all objects and their subjects
      const result = [];
      const objects = this.indexes.pos.get(predicate);
      for (const [obj, subjects] of objects.entries()) {
        subjects.forEach(subj => result.push({ subject: subj, object: obj }));
      }
      return result;
    }

    const objects = this.indexes.pos.get(predicate);
    if (!objects.has(object)) {
      return [];
    }

    return objects.get(object);
  }

  /**
   * Query path: Follow a chain of relations
   * Example: queryPath(startId, ['uses', 'covers'])
   *   -> Paper uses Dataset, Dataset covers Region
   */
  queryPath(startId, path) {
    let current = [startId];

    for (const predicate of path) {
      const next = [];
      for (const id of current) {
        const objects = this.query(id, predicate);
        next.push(...objects);
      }
      current = next;

      if (current.length === 0) break;
    }

    return current.map(id => this.getEntity(id)).filter(Boolean);
  }

  /**
   * Match pattern: SPARQL-like query
   * Example: match({
   *   type: 'Paper',
   *   relations: [
   *     {predicate: 'studies', object: {type: 'Region', name: 'Amazon'}}
   *   ]
   * })
   */
  match(pattern) {
    // Start with entities of the specified type
    let candidates = pattern.type
      ? this.getEntitiesByType(pattern.type)
      : Array.from(this.entities.values());

    // Filter by attribute values
    if (pattern.attributes) {
      candidates = candidates.filter(entity =>
        this._matchAttributes(entity, pattern.attributes)
      );
    }

    // Filter by relations
    if (pattern.relations) {
      for (const rel of pattern.relations) {
        candidates = candidates.filter(entity => {
          const objects = this.query(entity.id, rel.predicate);

          if (rel.object) {
            // Match specific object pattern
            return objects.some(objId => {
              const obj = this.getEntity(objId);
              return obj && this._matchAttributes(obj, rel.object);
            });
          } else {
            // Just check relation exists
            return objects.length > 0;
          }
        });
      }
    }

    return candidates;
  }

  /**
   * Get all relations for an entity
   */
  getRelations(entityId) {
    const outgoing = this.query(entityId);
    const incoming = [];

    // Find incoming relations
    for (const triple of this.triples) {
      if (triple.object === entityId) {
        incoming.push({
          subject: triple.subject,
          predicate: triple.predicate,
          direction: 'incoming'
        });
      }
    }

    return {
      outgoing: outgoing.map(r => ({
        predicate: r.predicate,
        object: r.object,
        direction: 'outgoing'
      })),
      incoming
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get store statistics
   */
  stats() {
    const typeCount = {};
    for (const entity of this.entities.values()) {
      typeCount[entity.type] = (typeCount[entity.type] || 0) + 1;
    }

    const relationCount = {};
    for (const triple of this.triples) {
      relationCount[triple.predicate] = (relationCount[triple.predicate] || 0) + 1;
    }

    // Verification state counts
    const verificationCount = {
      entities: {},
      triples: {}
    };

    for (const entity of this.entities.values()) {
      const state = entity.verificationState;
      verificationCount.entities[state] = (verificationCount.entities[state] || 0) + 1;
    }

    for (const triple of this.triples) {
      const state = triple.verificationState;
      verificationCount.triples[state] = (verificationCount.triples[state] || 0) + 1;
    }

    return {
      totalEntities: this.entities.size,
      totalTriples: this.triples.length,
      entitiesByType: typeCount,
      triplesByRelation: relationCount,
      verificationStates: verificationCount
    };
  }

  /**
   * Get unverified entities (extracted but not reviewed/verified)
   */
  getUnverifiedEntities() {
    return Array.from(this.entities.values()).filter(
      e => e.verificationState === VERIFICATION_STATES.EXTRACTED
    );
  }

  /**
   * Get entities by verification state
   */
  getEntitiesByVerificationState(state) {
    if (!Object.values(VERIFICATION_STATES).includes(state)) {
      throw new Error(`Invalid verification state: ${state}`);
    }
    return Array.from(this.entities.values()).filter(
      e => e.verificationState === state
    );
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Save to disk
   */
  async save(filePath = this.storagePath) {
    const data = {
      version: '1.1',  // Bumped version for verification state persistence
      updated: new Date().toISOString(),
      entities: Array.from(this.entities.entries()).map(([id, entity]) => ({
        id: entity.id,
        type: entity.type,
        attributes: entity.attributes,
        createdAt: entity.createdAt,
        metadata: entity.metadata,
        // Add verification state fields (bug fix)
        verificationState: entity.verificationState,
        reviewedBy: entity.reviewedBy,
        reviewedAt: entity.reviewedAt,
        notes: entity.notes || []
      })),
      triples: this.triples.map(t => ({
        id: t.id,
        subject: t.subject,
        predicate: t.predicate,
        object: t.object,
        metadata: t.metadata,
        // Add verification state fields (bug fix)
        verificationState: t.verificationState,
        reviewedBy: t.reviewedBy,
        reviewedAt: t.reviewedAt,
        notes: t.notes || []
      }))
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load from disk
   */
  async load(filePath = this.storagePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      // Clear current state
      this.entities.clear();
      this.triples = [];
      this._clearIndexes();

      // Version migration: handle older formats
      const needsMigration = data.version === '1.0' || !data.version;

      // Load entities
      for (const entityData of data.entities) {
        const entity = new Entity(
          entityData.type,
          entityData.attributes,
          {
            ...entityData.metadata,
            id: entityData.id,
            // Restore verification state (with migration support)
            verificationState: entityData.verificationState || (needsMigration ? VERIFICATION_STATES.EXTRACTED : VERIFICATION_STATES.EXTRACTED),
            reviewedBy: entityData.reviewedBy || null,
            reviewedAt: entityData.reviewedAt || null,
            notes: entityData.notes || []
          }
        );
        entity.createdAt = entityData.createdAt;
        // Ensure verification state is set correctly
        if (entityData.verificationState) {
          entity.verificationState = entityData.verificationState;
        }
        this.addEntity(entity);
      }

      // Load triples
      for (const tripleData of data.triples) {
        const tripleId = this.addTriple(
          tripleData.subject,
          tripleData.predicate,
          tripleData.object,
          {
            ...tripleData.metadata,
            // Restore verification state
            verificationState: tripleData.verificationState || VERIFICATION_STATES.EXTRACTED,
            reviewedBy: tripleData.reviewedBy || null,
            reviewedAt: tripleData.reviewedAt || null,
            notes: tripleData.notes || []
          }
        );

        // Restore triple verification state if present
        if (tripleData.verificationState) {
          const triple = this.triples.find(t => t.id === tripleId);
          if (triple) {
            triple.verificationState = tripleData.verificationState;
            triple.reviewedBy = tripleData.reviewedBy || null;
            triple.reviewedAt = tripleData.reviewedAt || null;
            triple.notes = tripleData.notes || [];
          }
        }
      }

      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false; // File doesn't exist yet
      }
      throw err;
    }
  }

  // ==========================================================================
  // EXPORT/VISUALIZATION
  // ==========================================================================

  /**
   * Export to DOT format (Graphviz)
   */
  toDot() {
    let dot = 'digraph Knowledge {\n';
    dot += '  node [shape=box, style=rounded];\n\n';

    // Add entities
    for (const [id, entity] of this.entities.entries()) {
      const label = `${entity.type}\\n${entity.getDisplayName()}`;
      dot += `  "${id}" [label="${label}"];\n`;
    }

    dot += '\n';

    // Add triples
    for (const triple of this.triples) {
      dot += `  "${triple.subject}" -> "${triple.object}" [label="${triple.predicate}"];\n`;
    }

    dot += '}\n';
    return dot;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  _indexTriple(triple) {
    // SPO index
    if (!this.indexes.spo.has(triple.subject)) {
      this.indexes.spo.set(triple.subject, new Map());
    }
    if (!this.indexes.spo.get(triple.subject).has(triple.predicate)) {
      this.indexes.spo.get(triple.subject).set(triple.predicate, []);
    }
    this.indexes.spo.get(triple.subject).get(triple.predicate).push(triple.object);

    // POS index
    if (!this.indexes.pos.has(triple.predicate)) {
      this.indexes.pos.set(triple.predicate, new Map());
    }
    if (!this.indexes.pos.get(triple.predicate).has(triple.object)) {
      this.indexes.pos.get(triple.predicate).set(triple.object, []);
    }
    this.indexes.pos.get(triple.predicate).get(triple.object).push(triple.subject);

    // OPS index
    if (!this.indexes.ops.has(triple.object)) {
      this.indexes.ops.set(triple.object, new Map());
    }
    if (!this.indexes.ops.get(triple.object).has(triple.predicate)) {
      this.indexes.ops.get(triple.object).set(triple.predicate, []);
    }
    this.indexes.ops.get(triple.object).get(triple.predicate).push(triple.subject);
  }

  _clearIndexes() {
    this.indexes.spo.clear();
    this.indexes.pos.clear();
    this.indexes.ops.clear();
    this.indexes.typeIndex.clear();
  }

  _matchAttributes(entity, pattern) {
    for (const [key, value] of Object.entries(pattern)) {
      if (key === 'type' && entity.type !== value) {
        return false;
      }
      if (entity.attributes[key] !== value) {
        return false;
      }
    }
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

// Type prefix mapping for readable IDs
const TYPE_PREFIXES = {
  // ============================================================
  // Layer 0: Foundation Entities
  // ============================================================
  'Entity': 'ent',
  'Object': 'obj',
  'System': 'sys',
  'State': 'state',
  'Process': 'proc',
  'Event': 'evt',
  'Action': 'act',
  'Intervention': 'interv',
  'Agent': 'agent',
  'Resource': 'res',
  'Data': 'data',
  'Claim': 'claim',
  'Evidence': 'ev',
  'Observation': 'obs',
  'Measurement': 'meas',
  'Method': 'method',
  'Model': 'model',
  'Metric': 'metric',
  'Uncertainty': 'unc',
  'Scenario': 'scen',
  'Risk': 'risk',
  'Location': 'loc',
  'Time': 'time',
  'Relation': 'rel',

  // ============================================================
  // Layer 1: Source Entities
  // ============================================================
  'Source': 'src',
  'Paper': 'paper',
  'Preprint': 'preprint',
  'Thesis': 'thesis',
  'Repository': 'repo',
  'Package': 'pkg',
  'APIPage': 'api',
  'DatasetPage': 'ds',
  'DataCatalog': 'cat',
  'Report': 'report',
  'AssessmentReport': 'ar',
  'WhitePaper': 'wp',
  'News': 'news',
  'PressRelease': 'pr',
  'PolicyDocument': 'policy',
  'StandardDocument': 'std',
  'Documentation': 'doc',
  'ModelCard': 'mc',
  'Benchmark': 'bench',
  'TechnicalBlog': 'blog',
  'OntologyFile': 'ont',
  'KnowledgeGraph': 'kg',

  // ============================================================
  // Layer 2: Capability Entities
  // ============================================================
  // Data
  'Dataset': 'dataset',
  'DataProduct': 'dp',
  'Variable': 'var',
  'Feature': 'feat',
  'Coverage': 'cov',
  'Resolution': 'resol',
  'DataQuality': 'dq',
  // Observation
  'Sensor': 'sensor',
  'Satellite': 'sat',
  'Gauge': 'gauge',
  'Station': 'stn',
  'RemoteSensingSystem': 'rss',
  'InSituNetwork': 'net',
  'MonitoringProgram': 'mp',
  // Modeling
  'Algorithm': 'algo',
  'Simulation': 'sim',
  'Forecasting': 'fc',
  'Calibration': 'cal',
  'Validation': 'val',
  'UncertaintyQuantification': 'uq',
  // Computing
  'Software': 'sw',
  'API': 'api',
  'Workflow': 'wf',
  'Pipeline': 'pipe',
  'Interface': 'iface',
  'ExecutionEnvironment': 'env',
  'CloudService': 'cloud',
  // Governance
  'Policy': 'pol',
  'Regulation': 'reg',
  'Institution': 'inst',
  'Stakeholder': 'stake',
  'ManagementPlan': 'plan',
  'Standard': 'std',
  'Protocol': 'proto',
  'Agreement': 'agr',
  // Socioeconomic
  'PopulationDataset': 'pop',
  'EconomicIndicator': 'econ',
  'LandUseClassification': 'luc',
  'InfrastructureInventory': 'infra',
  'ExposureDataset': 'exp',
  'VulnerabilityIndex': 'vi',
  'DemandModel': 'demand',
  'BehaviorModel': 'behav',
  // Evidence/Assessment
  'Assessment': 'assess',
  'Indicator': 'ind',
  'Index': 'idx',
  'EvidenceChain': 'echain',
  'EvaluationFramework': 'ef',
  'RiskAssessment': 'ra',
  'ImpactAssessment': 'ia',
  'ConfidenceLevel': 'cl',
  'ScenarioAssessment': 'sa',
  // Action/Intervention
  'AdaptationMeasure': 'adapt',
  'MitigationMeasure': 'mit',
  'ManagementAction': 'ma',
  'EmergencyResponse': 'er',
  'ResourceAllocation': 'ralloc',
  'EngineeringMeasure': 'eng',
  'PolicyAction': 'pact',
  'OperationalPlan': 'op',

  // ============================================================
  // Layer 3: World Entities
  // ============================================================
  // Earth System
  'EarthSystem': 'esys',
  'Hydrosphere': 'hydro',
  'Atmosphere': 'atm',
  'Biosphere': 'bio',
  'Cryosphere': 'cryo',
  'Lithosphere': 'litho',
  'Anthroposphere': 'anthro',
  // Earth Object
  'EarthObject': 'eo',
  'Region': 'region',
  'Basin': 'basin',
  'Watershed': 'wshed',
  'Glacier': 'glacier',
  'Lake': 'lake',
  'Aquifer': 'aq',
  'Coastline': 'coast',
  'MountainRange': 'mtn',
  // Earth Process
  'EarthProcess': 'ep',
  'WaterCycle': 'wc',
  'CarbonCycle': 'cc',
  'Erosion': 'erosion',
  'Sedimentation': 'sed',
  // Earth Variable
  'EarthVariable': 'ev',
  'Streamflow': 'flow',
  'Precipitation': 'precip',
  'Temperature': 'temp',
  'SoilMoisture': 'sm',
  'GroundwaterLevel': 'gwl',
  'Evapotranspiration': 'et',
  // Resource
  'ResourceStock': 'rs',
  'WaterResource': 'wr',
  'EnergyResource': 'er',
  'ResourceFlow': 'rf',
  'WaterWithdrawal': 'ww',
  // Hazard
  'Hazard': 'haz',
  'FloodEvent': 'flood',
  'DroughtEvent': 'drought',
  'Heatwave': 'hw',
  'Wildfire': 'wf',
  'Landslide': 'ls',
  // Risk
  'EarthRisk': 'erisk',
  'FloodRisk': 'frisk',
  'DroughtRisk': 'drisk',
  'Exposure': 'exp',
  'Vulnerability': 'vuln',
  // Infrastructure
  'Infrastructure': 'infra',
  'Dam': 'dam',
  'Reservoir': 'resv',
  'PowerGrid': 'grid',
  'WaterSupplySystem': 'wss',
  // Human Activity
  'HumanActivity': 'ha',
  'Irrigation': 'irr',
  'Urbanization': 'urb',
  'Deforestation': 'defor',
  // Scenario
  'EarthScenario': 'escen',
  'ClimateScenario': 'cs',
  'DevelopmentScenario': 'ds',
  // Model Output
  'ModelOutput': 'mo',
  'Forecast': 'fc',
  'Projection': 'proj',
  // Feedback
  'Feedback': 'fb',
  'Teleconnection': 'tc',
  'Threshold': 'th',

  // ============================================================
  // Layer 4: Domain Entities
  // ============================================================
  // Hydrology
  'River': 'river',
  'StreamReach': 'reach',
  'GaugeStation': 'gstation',
  'PrecipitationGauge': 'pgauge',
  'HydrologicalModel': 'hmodel',
  'RainfallRunoffModel': 'rrm',
  'GroundwaterModel': 'gwm',
  'RunoffGeneration': 'rgen',
  'Infiltration': 'infilt',
  'FlashFlood': 'ff',
  'RiverineFlood': 'rf',
  'WaterQualityIndicator': 'wqi',
  // Climate
  'ClimateZone': 'cz',
  'ClimateIndex': 'ci',
  'ENSO': 'enso',
  'ClimateModel': 'cm',
  'GCM': 'gcm',
  'RCM': 'rcm',
  'ClimateProjection': 'cp',
  'ExtremesIndicator': 'ei',
  // Urban
  'City': 'city',
  'Building': 'bldg',
  'DrainageNetwork': 'dn',
  'UrbanFlood': 'uf',
  'TrafficFlow': 'tf',
  'UrbanHeatIsland': 'uhi',
  // Energy
  'Substation': 'sub',
  'TransmissionLine': 'tl',
  'RenewableGeneration': 'rgen',
  'EnergyStorage': 'estor',
  'EnergyDemand': 'ed',
  'HydropowerPlant': 'hpp',
  // Ecology
  'Ecosystem': 'eco',
  'Vegetation': 'veg',
  'Habitat': 'hab',
  'Species': 'sp',
  'BiodiversityIndex': 'bi',
  'CarbonSink': 'csink',
  'EcosystemService': 'es',
  // Agriculture
  'Crop': 'crop',
  'CropYield': 'cy',
  'IrrigationDemand': 'id',
  'SoilCondition': 'sc',
  'GrowingSeason': 'gs',
  'AgriculturalDrought': 'ad',

  // Special
  'triple': 'triple'
};

function generateId(type) {
  // Use predefined prefix if available, otherwise generate from type name
  let prefix = TYPE_PREFIXES[type];

  if (!prefix) {
    // Fallback: use first 4 lowercase characters, preserving readability
    prefix = type.toLowerCase().substring(0, 4);
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  TripleStore,
  Entity,
  Triple,
  VERIFICATION_STATES
};
