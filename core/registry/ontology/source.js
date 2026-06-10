/**
 * Layer 1: Source Ontology
 * Describes the source shell - where information comes from, its type, and content structure.
 *
 * This layer answers: "Where does this information come from? What type is it? What content can it provide?"
 *
 * Key insight: Different sources have different decomposition patterns:
 * - Paper → abstract, methods, results, figures, references
 * - Repository → README, code modules, config, workflow, dependencies
 * - DatasetPage → variables, coverage, access, license, version
 * - Report → chapters, claims, indicators, recommendations
 * - News → event, location, time, actor, impact
 * - PolicyDocument → institution, rule, target, intervention
 */

// ============================================================================
// SOURCE ENTITY TYPES
// ============================================================================

const SOURCE_ENTITIES = {
  // === Base Source Type ===
  Source: {
    name: 'Source',
    extends: 'Entity',
    layer: 'source',
    category: 'source',
    description: 'A source of information that can be decomposed into objects',
    additionalRequired: ['type', 'identifier'],
    additionalOptional: [
      'title', 'description', 'url', 'credibility',
      'accessDate', 'contentLevel', 'language', 'license'
    ],
    additionalDefaults: {
      credibility: 0.5,
      contentLevel: 'unknown'
    }
  },

  // === Academic Sources ===
  Paper: {
    name: 'Paper',
    extends: 'Source',
    layer: 'source',
    category: 'academic',
    description: 'A scientific paper or publication',
    additionalRequired: ['title'],
    additionalOptional: [
      'authors', 'year', 'doi', 'venue', 'journal',
      'abstract', 'keywords', 'citationCount', 'references',
      'sections', 'figures', 'tables', 'openAccess',
      'publisher', 'volume', 'issue', 'pages'
    ],
    additionalDefaults: {
      contentLevel: 'abstract_only',
      openAccess: false,
      citationCount: 0
    }
  },

  Preprint: {
    name: 'Preprint',
    extends: 'Paper',
    layer: 'source',
    category: 'academic',
    description: 'A preprint not yet peer-reviewed',
    additionalRequired: [],
    additionalOptional: ['server', 'version', 'status'],
    additionalDefaults: { server: 'arXiv' }
  },

  Thesis: {
    name: 'Thesis',
    extends: 'Paper',
    layer: 'source',
    category: 'academic',
    description: 'A doctoral or master thesis',
    additionalRequired: [],
    additionalOptional: ['institution', 'degree', 'advisor', 'department'],
    additionalDefaults: {}
  },

  // === Code Sources ===
  Repository: {
    name: 'Repository',
    extends: 'Source',
    layer: 'source',
    category: 'code',
    description: 'A code repository or software project',
    additionalRequired: ['repo'],
    additionalOptional: [
      'language', 'stars', 'forks', 'issues', 'license',
      'readme', 'tree', 'keyFiles', 'topics', 'branches',
      'lastCommit', 'contributors', 'documentation', 'tests',
      'ci', 'releases', 'dependencies'
    ],
    additionalDefaults: {
      stars: 0,
      forks: 0,
      issues: 0
    }
  },

  Package: {
    name: 'Package',
    extends: 'Source',
    layer: 'source',
    category: 'code',
    description: 'A software package or library',
    additionalRequired: ['name', 'registry'],
    additionalOptional: [
      'version', 'dependencies', 'downloads', 'maintainers',
      'documentation', 'repository', 'license'
    ],
    additionalDefaults: {}
  },

  APIPage: {
    name: 'APIPage',
    extends: 'Source',
    layer: 'source',
    category: 'code',
    description: 'An API documentation page',
    additionalRequired: ['apiName'],
    additionalOptional: [
      'endpoints', 'authentication', 'rateLimits', 'examples',
      'sdkLanguages', 'baseUrl', 'version'
    ],
    additionalDefaults: {}
  },

  // === Data Sources ===
  DatasetPage: {
    name: 'DatasetPage',
    extends: 'Source',
    layer: 'source',
    category: 'data',
    description: 'A dataset landing page or catalog entry',
    additionalRequired: ['datasetName'],
    additionalOptional: [
      'acronym', 'version', 'doi', 'provider',
      'spatialCoverage', 'temporalCoverage', 'spatialResolution', 'temporalResolution',
      'variables', 'samples', 'citations', 'relatedDatasets',
      'quality', 'completeness', 'updateFrequency', 'accessMethod'
    ],
    additionalDefaults: {
      version: '1.0',
      samples: 0
    }
  },

  DataCatalog: {
    name: 'DataCatalog',
    extends: 'Source',
    layer: 'source',
    category: 'data',
    description: 'A data catalog or portal',
    additionalRequired: ['name'],
    additionalOptional: [
      'datasets', 'searchApi', 'filters', 'totalRecords',
      'provider', 'domain'
    ],
    additionalDefaults: { datasets: [], totalRecords: 0 }
  },

  // === Report Sources ===
  Report: {
    name: 'Report',
    extends: 'Source',
    layer: 'source',
    category: 'report',
    description: 'A technical report or assessment document',
    additionalRequired: ['title'],
    additionalOptional: [
      'institution', 'reportType', 'authors', 'year',
      'sections', 'recommendations', 'scenarios',
      'indicators', 'regions', 'policyRelevance', 'executiveSummary'
    ],
    additionalDefaults: {
      reportType: 'technical'
    }
  },

  AssessmentReport: {
    name: 'AssessmentReport',
    extends: 'Report',
    layer: 'source',
    category: 'report',
    description: 'A comprehensive assessment report (e.g., IPCC, World Bank)',
    additionalRequired: [],
    additionalOptional: [
      'assessmentCycle', 'workingGroups', 'chapters',
      'summaryForPolicymakers', 'confidenceLevels', 'scenarios'
    ],
    additionalDefaults: {}
  },

  WhitePaper: {
    name: 'WhitePaper',
    extends: 'Report',
    layer: 'source',
    category: 'report',
    description: 'A white paper or position paper',
    additionalRequired: [],
    additionalOptional: ['organization', 'audience', 'keyPoints'],
    additionalDefaults: {}
  },

  // === News Sources ===
  News: {
    name: 'News',
    extends: 'Source',
    layer: 'source',
    category: 'news',
    description: 'A news article or press release',
    additionalRequired: ['title'],
    additionalOptional: [
      'source', 'date', 'author', 'category',
      'event', 'actors', 'quotes', 'urls',
      'sentiment', 'verification', 'relatedEvents'
    ],
    additionalDefaults: {}
  },

  PressRelease: {
    name: 'PressRelease',
    extends: 'News',
    layer: 'source',
    category: 'news',
    description: 'An official press release',
    additionalRequired: [],
    additionalOptional: ['organization', 'contact', 'embargo'],
    additionalDefaults: {}
  },

  // === Policy Sources ===
  PolicyDocument: {
    name: 'PolicyDocument',
    extends: 'Source',
    layer: 'source',
    category: 'policy',
    description: 'A policy document, regulation, or law',
    additionalRequired: ['title'],
    additionalOptional: [
      'jurisdiction', 'effectiveDate', 'status', 'issuingBody',
      'enforcement', 'amendments', 'relatedPolicies', 'impactAssessment'
    ],
    additionalDefaults: { status: 'active' }
  },

  StandardDocument: {
    name: 'StandardDocument',
    extends: 'Source',
    layer: 'source',
    category: 'policy',
    description: 'A technical standard or specification',
    additionalRequired: ['standardId'],
    additionalOptional: [
      'title', 'version', 'issuingBody', 'status',
      'relatedStandards', 'requirements', 'complianceCriteria'
    ],
    additionalDefaults: {}
  },

  // === Technical Sources ===
  Documentation: {
    name: 'Documentation',
    extends: 'Source',
    layer: 'source',
    category: 'technical',
    description: 'Technical documentation',
    additionalRequired: ['name'],
    additionalOptional: [
      'version', 'sections', 'examples', 'apiReference',
      'tutorials', 'changelog', 'platform'
    ],
    additionalDefaults: {}
  },

  ModelCard: {
    name: 'ModelCard',
    extends: 'Source',
    layer: 'source',
    category: 'technical',
    description: 'A model card describing an ML model',
    additionalRequired: ['modelName'],
    additionalOptional: [
      'developer', 'version', 'license', 'intendedUse',
      'trainingData', 'evaluation', 'limitations', 'ethicalConsiderations'
    ],
    additionalDefaults: {}
  },

  Benchmark: {
    name: 'Benchmark',
    extends: 'Source',
    layer: 'source',
    category: 'technical',
    description: 'A benchmark dataset with evaluation protocol',
    additionalRequired: ['name'],
    additionalOptional: [
      'metrics', 'baselines', 'leaderboard',
      'evaluationProtocol', 'splits', 'domain'
    ],
    additionalDefaults: {}
  },

  TechnicalBlog: {
    name: 'TechnicalBlog',
    extends: 'Source',
    layer: 'source',
    category: 'technical',
    description: 'A technical blog post or article',
    additionalRequired: ['title'],
    additionalOptional: [
      'author', 'date', 'platform', 'tags',
      'codeLinks', 'relatedWork', 'keyInsights'
    ],
    additionalDefaults: {}
  },

  // === Knowledge Organization Sources ===
  OntologyFile: {
    name: 'OntologyFile',
    extends: 'Source',
    layer: 'source',
    category: 'knowledge',
    description: 'An ontology or knowledge graph file',
    additionalRequired: ['name'],
    additionalOptional: [
      'format', 'namespace', 'classes', 'properties',
      'individuals', 'version', 'iri'
    ],
    additionalDefaults: {}
  },

  KnowledgeGraph: {
    name: 'KnowledgeGraph',
    extends: 'Source',
    layer: 'source',
    category: 'knowledge',
    description: 'A knowledge graph or linked data source',
    additionalRequired: ['name'],
    additionalOptional: [
      'endpoint', 'format', 'size', 'coverage',
      'lastUpdated', 'accessMethod'
    ],
    additionalDefaults: {}
  }
};

// ============================================================================
// SOURCE RELATION TYPES
// ============================================================================

const SOURCE_RELATIONS = {
  // === Citation Relations ===
  cited_by: {
    name: 'cited_by',
    layer: 'source',
    category: 'citation',
    description: 'Subject is cited by the object',
    domain: ['Paper', 'Source'],
    range: ['Paper', 'Source']
  },

  cites: {
    name: 'cites',
    layer: 'source',
    category: 'citation',
    description: 'Subject cites the object',
    domain: ['Paper', 'Source'],
    range: ['Paper', 'Source']
  },

  references: {
    name: 'references',
    layer: 'source',
    category: 'citation',
    description: 'Subject references the object',
    domain: ['Source'],
    range: ['Source', 'Entity']
  },

  // === Version Relations ===
  version_of: {
    name: 'version_of',
    layer: 'source',
    category: 'version',
    description: 'Subject is a version of the object',
    domain: ['Source'],
    range: ['Source']
  },

  derived_from: {
    name: 'derived_from',
    layer: 'source',
    category: 'version',
    description: 'Subject is derived from the object',
    domain: ['Source'],
    range: ['Source']
  },

  // === Content Relations ===
  has_figure: {
    name: 'has_figure',
    layer: 'source',
    category: 'content',
    description: 'Subject contains the object figure',
    domain: ['Paper', 'Report', 'Source'],
    range: ['Figure', 'Entity']
  },

  has_section: {
    name: 'has_section',
    layer: 'source',
    category: 'content',
    description: 'Subject has the object as a section',
    domain: ['Source'],
    range: ['Entity']
  },

  has_dataset: {
    name: 'has_dataset',
    layer: 'source',
    category: 'content',
    description: 'Subject references or contains the object dataset',
    domain: ['Paper', 'Repository', 'Source'],
    range: ['DatasetPage', 'Entity']
  },

  // === Dependency Relations ===
  depends_on: {
    name: 'depends_on',
    layer: 'source',
    category: 'dependency',
    description: 'Subject depends on the object',
    domain: ['Repository', 'Package', 'Source'],
    range: ['Repository', 'Package', 'Source']
  },

  uses_package: {
    name: 'uses_package',
    layer: 'source',
    category: 'dependency',
    description: 'Subject uses the object package',
    domain: ['Repository', 'Source'],
    range: ['Package']
  },

  // === Platform Relations ===
  hosted_on: {
    name: 'hosted_on',
    layer: 'source',
    category: 'platform',
    description: 'Subject is hosted on the object platform',
    domain: ['Repository', 'Source'],
    range: ['Entity']
  },

  published_by: {
    name: 'published_by',
    layer: 'source',
    category: 'platform',
    description: 'Subject is published by the object',
    domain: ['Paper', 'Report', 'Source'],
    range: ['Entity']
  },

  // === Quality Relations ===
  reviewed_by: {
    name: 'reviewed_by',
    layer: 'source',
    category: 'quality',
    description: 'Subject is reviewed by the object',
    domain: ['Paper', 'Source'],
    range: ['Agent', 'Process']
  },

  validated_by: {
    name: 'validated_by',
    layer: 'source',
    category: 'quality',
    description: 'Subject is validated by the object',
    domain: ['DatasetPage', 'Source'],
    range: ['Process', 'Agent', 'Source']
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const foundation = require('./foundation');

function getMergedSchema(typeName) {
  const sourceDef = SOURCE_ENTITIES[typeName];
  if (!sourceDef) return null;

  // Get parent schema from foundation
  let parentSchema = foundation.getEntitySchema(sourceDef.extends);
  if (!parentSchema) {
    // Check if parent is another source type
    const parentDef = SOURCE_ENTITIES[sourceDef.extends];
    if (parentDef) {
      parentSchema = getMergedSchema(sourceDef.extends);
    }
  }

  if (!parentSchema) {
    return {
      name: typeName,
      extends: sourceDef.extends,
      layer: 'source',
      category: sourceDef.category,
      description: sourceDef.description,
      required: [...sourceDef.additionalRequired],
      optional: [...sourceDef.additionalOptional],
      defaults: { ...sourceDef.additionalDefaults }
    };
  }

  return {
    name: typeName,
    extends: sourceDef.extends,
    layer: 'source',
    category: sourceDef.category,
    description: sourceDef.description,
    required: [...parentSchema.required, ...sourceDef.additionalRequired],
    optional: [...parentSchema.optional, ...sourceDef.additionalOptional],
    defaults: { ...parentSchema.defaults, ...sourceDef.additionalDefaults }
  };
}

function getSourceTypeNames() {
  return Object.keys(SOURCE_ENTITIES);
}

function isSourceType(typeName) {
  return SOURCE_ENTITIES.hasOwnProperty(typeName);
}

function getParentType(typeName) {
  const def = SOURCE_ENTITIES[typeName];
  return def ? def.extends : null;
}

function getSourceTypesByCategory() {
  const categories = {};
  for (const [key, def] of Object.entries(SOURCE_ENTITIES)) {
    const cat = def.category;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(def.name);
  }
  return categories;
}

function validateSourceType(type) {
  return Object.values(SOURCE_ENTITIES).some(d => d.name === type);
}

module.exports = {
  SOURCE_ENTITIES,
  SOURCE_RELATIONS,
  getMergedSchema,
  getSourceTypeNames,
  isSourceType,
  getParentType,
  getSourceTypesByCategory,
  validateSourceType
};
