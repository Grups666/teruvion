/**
 * Mock TripleStore for Testing
 * In-memory implementation without file persistence
 */

const { EventEmitter } = require('events');

// Verification states
const VERIFICATION_STATES = {
  EXTRACTED: 'extracted',
  REVIEWED: 'reviewed',
  VERIFIED: 'verified',
  UNCERTAIN: 'uncertain',
  REJECTED: 'rejected'
};

// ID generation with proper prefixes
const TYPE_PREFIXES = {
  'Source': 'src',
  'Entity': 'ent',
  'Claim': 'claim',
  'Evidence': 'ev',
  'Data': 'data',
  'Method': 'method',
  'Process': 'proc',
  'Event': 'evt',
  'System': 'sys',
  'Location': 'loc',
  'Time': 'time',
  'Result': 'result',
  'Metric': 'metric',
  'Uncertainty': 'unc',
  // Source types
  'Paper': 'paper',
  'Code': 'code',
  'Dataset': 'dataset',
  'Report': 'report',
  'News': 'news',
  // Legacy types
  'ResearchQuestion': 'rq',
  'Hypothesis': 'hypo',
  'Theory': 'theory',
  'Model': 'model',
  'Experiment': 'exp',
  'Region': 'region',
  'TimeRange': 'trange',
  'Workflow': 'wf',
  'Figure': 'fig',
  // Domain types
  'Basin': 'basin',
  'Watershed': 'wshed',
  'Gauge': 'gauge',
  'Streamflow': 'flow',
  'FloodEvent': 'flood',
  'HydrologicalModel': 'hydro',
  'NeuralNetwork': 'nn',
  'TrainingRun': 'train',
  'Benchmark': 'bench',
  'Checkpoint': 'ckpt',
  'Institution': 'inst',
  'Regulation': 'reg',
  'Stakeholder': 'stake',
  'Impact': 'impact'
};

function generateId(type) {
  const prefix = TYPE_PREFIXES[type] || type.toLowerCase().substring(0, 4);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Mock Entity class
 */
class MockEntity {
  constructor(type, attributes = {}, metadata = {}) {
    this.id = generateId(type);
    this.type = type;
    this.attributes = attributes || {};
    this.createdAt = new Date().toISOString();
    this.metadata = {
      confidence: 0.8,
      source: null,
      extractedBy: 'test',
      ...metadata
    };
    this.verificationState = VERIFICATION_STATES.EXTRACTED;
    this.reviewedBy = null;
    this.reviewedAt = null;
    this.notes = null;
  }

  getDisplayName() {
    return this.attributes.name || this.attributes.title || this.attributes.statement || this.id;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      attributes: this.attributes,
      createdAt: this.createdAt,
      metadata: this.metadata,
      verificationState: this.verificationState,
      reviewedBy: this.reviewedBy,
      reviewedAt: this.reviewedAt,
      notes: this.notes
    };
  }
}

/**
 * Mock Triple class
 */
class MockTriple {
  constructor(subject, predicate, object, metadata = {}) {
    this.id = `triple-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.metadata = {
      confidence: 0.8,
      source: null,
      extractedBy: 'test',
      timestamp: new Date().toISOString(),
      ...metadata
    };
    this.verificationState = VERIFICATION_STATES.EXTRACTED;
    this.reviewedBy = null;
    this.reviewedAt = null;
    this.notes = null;
  }

  toJSON() {
    return {
      id: this.id,
      subject: this.subject,
      predicate: this.predicate,
      object: this.object,
      metadata: this.metadata,
      verificationState: this.verificationState,
      reviewedBy: this.reviewedBy,
      reviewedAt: this.reviewedAt,
      notes: this.notes
    };
  }
}

/**
 * Mock TripleStore class
 * In-memory implementation for testing
 */
class MockTripleStore extends EventEmitter {
  constructor() {
    super();
    this.entities = new Map();
    this.triples = [];
    this.indexes = {
      spo: new Map(), // subject -> predicate -> [objects]
      pos: new Map(), // predicate -> object -> [subjects]
      ops: new Map(), // object -> predicate -> [subjects]
      typeIndex: new Map() // type -> [entityIds]
    };
  }

  // Entity operations
  addEntity(entity) {
    if (!(entity instanceof MockEntity)) {
      throw new Error('Must provide a MockEntity instance');
    }

    this.entities.set(entity.id, entity);

    // Update type index
    if (!this.indexes.typeIndex.has(entity.type)) {
      this.indexes.typeIndex.set(entity.type, new Set());
    }
    this.indexes.typeIndex.get(entity.type).add(entity.id);

    this.emit('entity:added', entity);
    return entity.id;
  }

  getEntity(id) {
    return this.entities.get(id);
  }

  getEntitiesByType(type) {
    const ids = this.indexes.typeIndex.get(type);
    if (!ids) return [];
    return Array.from(ids).map(id => this.entities.get(id)).filter(Boolean);
  }

  hasEntity(id) {
    return this.entities.has(id);
  }

  // Triple operations
  addTriple(subject, predicate, object, metadata = {}) {
    // Validate subject exists
    if (!this.hasEntity(subject)) {
      throw new Error(`Subject entity not found: ${subject}`);
    }

    // Validate object is either an entity ID or a literal
    const isEntityObject = object.startsWith('src-') ||
                           object.startsWith('ent-') ||
                           object.startsWith('claim-') ||
                           object.startsWith('data-') ||
                           object.startsWith('method-') ||
                           object.startsWith('paper-') ||
                           object.startsWith('code-') ||
                           object.startsWith('dataset-') ||
                           object.startsWith('region-') ||
                           object.startsWith('loc-');

    if (isEntityObject && !this.hasEntity(object)) {
      throw new Error(`Object entity not found: ${object}`);
    }

    const triple = new MockTriple(subject, predicate, object, metadata);
    this.triples.push(triple);

    // Update SPO index
    if (!this.indexes.spo.has(subject)) {
      this.indexes.spo.set(subject, new Map());
    }
    if (!this.indexes.spo.get(subject).has(predicate)) {
      this.indexes.spo.get(subject).set(predicate, []);
    }
    this.indexes.spo.get(subject).get(predicate).push({ object, tripleId: triple.id });

    // Update POS index
    if (!this.indexes.pos.has(predicate)) {
      this.indexes.pos.set(predicate, new Map());
    }
    if (!this.indexes.pos.get(predicate).has(object)) {
      this.indexes.pos.get(predicate).set(object, []);
    }
    this.indexes.pos.get(predicate).get(object).push({ subject, tripleId: triple.id });

    // Update OPS index
    if (!this.indexes.ops.has(object)) {
      this.indexes.ops.set(object, new Map());
    }
    if (!this.indexes.ops.get(object).has(predicate)) {
      this.indexes.ops.get(object).set(predicate, []);
    }
    this.indexes.ops.get(object).get(predicate).push({ subject, tripleId: triple.id });

    this.emit('triple:added', triple);
    return triple.id;
  }

  getAllTriples() {
    return this.triples;
  }

  // Query operations
  query(subject, predicate = null) {
    const results = [];

    if (!this.indexes.spo.has(subject)) {
      return results;
    }

    const predicateMap = this.indexes.spo.get(subject);

    if (predicate) {
      const objects = predicateMap.get(predicate);
      if (objects) {
        results.push(...objects.map(o => ({ predicate, object: o.object, tripleId: o.tripleId })));
      }
    } else {
      for (const [pred, objects] of predicateMap) {
        results.push(...objects.map(o => ({ predicate: pred, object: o.object, tripleId: o.tripleId })));
      }
    }

    return results;
  }

  queryInverse(predicate, object = null) {
    const results = [];

    if (!this.indexes.ops.has(object)) {
      return results;
    }

    const predicateMap = this.indexes.ops.get(object);

    if (predicate) {
      const subjects = predicateMap.get(predicate);
      if (subjects) {
        results.push(...subjects.map(s => ({ subject: s.subject, predicate, tripleId: s.tripleId })));
      }
    } else {
      for (const [pred, subjects] of predicateMap) {
        results.push(...subjects.map(s => ({ subject: s.subject, predicate: pred, tripleId: s.tripleId })));
      }
    }

    return results;
  }

  getRelations(entityId) {
    const outgoing = this.query(entityId);
    const incoming = [];

    // Use ops index for incoming
    if (this.indexes.ops.has(entityId)) {
      const predicateMap = this.indexes.ops.get(entityId);
      for (const [predicate, subjects] of predicateMap) {
        incoming.push(...subjects.map(s => ({ subject: s.subject, predicate, object: entityId })));
      }
    }

    return { outgoing, incoming };
  }

  // Statistics
  stats() {
    const typeCounts = {};
    for (const [type, ids] of this.indexes.typeIndex) {
      typeCounts[type] = ids.size;
    }

    const relationCounts = {};
    for (const triple of this.triples) {
      relationCounts[triple.predicate] = (relationCounts[triple.predicate] || 0) + 1;
    }

    const verificationCounts = {
      extracted: 0,
      reviewed: 0,
      verified: 0,
      uncertain: 0,
      rejected: 0
    };

    for (const entity of this.entities.values()) {
      verificationCounts[entity.verificationState]++;
    }

    return {
      totalEntities: this.entities.size,
      totalTriples: this.triples.length,
      typeCounts,
      relationCounts,
      verificationCounts
    };
  }

  // Verification operations
  getUnverifiedEntities() {
    return Array.from(this.entities.values())
      .filter(e => e.verificationState === VERIFICATION_STATES.EXTRACTED);
  }

  verifyEntity(id, reviewer = 'test') {
    const entity = this.getEntity(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }
    entity.verificationState = VERIFICATION_STATES.VERIFIED;
    entity.reviewedBy = reviewer;
    entity.reviewedAt = new Date().toISOString();
    this.emit('entity:verified', entity);
  }

  // Clear all data
  clear() {
    this.entities.clear();
    this.triples = [];
    this.indexes.spo.clear();
    this.indexes.pos.clear();
    this.indexes.ops.clear();
    this.indexes.typeIndex.clear();
    this.emit('store:cleared');
  }

  // Serialization (for testing persistence)
  toJSON() {
    return {
      version: '1.1',
      updated: new Date().toISOString(),
      entities: Array.from(this.entities.values()).map(e => e.toJSON()),
      triples: this.triples.map(t => t.toJSON())
    };
  }

  static fromJSON(data) {
    const store = new MockTripleStore();
    for (const entityData of data.entities) {
      const entity = new MockEntity(entityData.type, entityData.attributes, entityData.metadata);
      entity.id = entityData.id;
      entity.createdAt = entityData.createdAt;
      entity.verificationState = entityData.verificationState || VERIFICATION_STATES.EXTRACTED;
      entity.reviewedBy = entityData.reviewedBy || null;
      entity.reviewedAt = entityData.reviewedAt || null;
      entity.notes = entityData.notes || null;
      store.addEntity(entity);
    }
    for (const tripleData of data.triples) {
      store.addTriple(tripleData.subject, tripleData.predicate, tripleData.object, tripleData.metadata);
    }
    return store;
  }
}

module.exports = {
  MockTripleStore,
  MockEntity,
  MockTriple,
  VERIFICATION_STATES,
  generateId,
  TYPE_PREFIXES
};
