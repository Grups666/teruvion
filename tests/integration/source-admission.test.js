/**
 * Source Admission Tests - Digital Earth Integration
 */

const { assert, describe, it } = require('../setup');
const { SourceAdmission, PROCESSING_DEPTHS } = require('../../core/admission/SourceAdmission');
const InformationDensityEvaluator = require('../../core/admission/evaluators/information-density');
const { SourceRoleEvaluator, SOURCE_ROLES, getActivatedOntology, detectSourceType } = require('../../core/admission/evaluators/source-role');
const { MockLLM, createMockLLM } = require('../helpers/mock-llm');

describe('Information Density Evaluator', () => {
  it('should score high density for rich content', () => {
    const evaluator = new InformationDensityEvaluator();

    const longAbstract = 'A'.repeat(6000);
    const result = evaluator.score({
      abstract: longAbstract,
      keywords: ['ml', 'hydrology', 'climate', 'flood'],
      authors: ['Author 1', 'Author 2', 'Author 3'],
      sections: ['intro', 'methods', 'results', 'discussion'],
      citationCount: 50,
      references: ['ref1', 'ref2', 'ref3'],
      variables: [{ name: 'temp' }, { name: 'precip' }],
      spatialCoverage: 'global',
      tree: new Array(15).fill('file.py')
    });

    assert.ok(result.score >= 0.5, `Should have high density score, got ${result.score}`);
    assert.ok(result.factors.length > 0, 'Should have density factors');
    assert.ok(result.level === 'high' || result.level === 'medium', `Should be high or medium density, got ${result.level}`);
  });

  it('should score low density for sparse content', () => {
    const evaluator = new InformationDensityEvaluator();

    const result = evaluator.score({
      abstract: 'Short text',
    });

    assert.ok(result.score < 0.3, 'Should have low density score');
    assert.strictEqual(result.level, 'low', 'Should be low density');
  });

  it('should recognize code indicators', () => {
    const evaluator = new InformationDensityEvaluator();

    const longReadme = 'A'.repeat(800);
    const result = evaluator.score({
      type: 'github',
      language: 'Python',
      tree: ['main.py', 'utils.py', 'test_main.py', 'README.md', 'config.yaml', 'model.py', 'data.py', 'train.py', 'evaluate.py', 'config.json', 'setup.py'],
      readme: longReadme
    });

    assert.ok(result.score > 0.2, `Should have reasonable density for code, got ${result.score}`);
    assert.ok(result.factors.includes('has_language'), 'Should detect language');
    assert.ok(result.factors.includes('has_readme'), 'Should detect readme');
  });

  it('should recognize dataset indicators', () => {
    const evaluator = new InformationDensityEvaluator();

    const result = evaluator.score({
      type: 'dataset',
      variables: [{ name: 'temperature' }, { name: 'precipitation' }],
      spatialCoverage: 'global',
      temporalCoverage: '1950-2020'
    });

    assert.ok(result.score > 0.3, 'Should have good density for dataset');
    assert.ok(result.factors.includes('has_variables'), 'Should detect variables');
    assert.ok(result.factors.includes('has_coverage'), 'Should detect coverage');
  });
});

describe('Source Role Evaluator', () => {
  it('should detect earth_content role for papers', () => {
    const evaluator = new SourceRoleEvaluator();
    const result = evaluator.score({
      type: 'Paper',
      title: 'Global flood forecasting using deep learning',
      abstract: 'This paper presents a hydrological model.',
      regions: [{ name: 'Example basin' }],
      hazards: [{ type: 'flood' }]
    });

    assert.ok(result.roles.earth_content >= 0.4, `earth_content should be detected, got ${result.roles.earth_content}`);
    assert.ok(result.detectedRoles.length > 0, 'Should have detected roles');
    // Primary role depends on which has higher score - could be earth_content or modeling_capability
    assert.ok(['earth_content', 'modeling_capability'].includes(result.primaryRole), 'Primary role should be earth_content or modeling_capability');
  });

  it('should detect data_capability role for datasets', () => {
    const evaluator = new SourceRoleEvaluator();
    const result = evaluator.score({
      type: 'DatasetPage',
      title: 'ERA5-Land climate reanalysis dataset',
      variables: ['temperature', 'precipitation', 'evaporation'],
      spatialCoverage: 'global'
    });

    assert.ok(result.roles.data_capability >= 0.4, `data_capability should be detected, got ${result.roles.data_capability}`);
    assert.ok(result.detectedRoles.some(r => r.role === 'data_capability'), 'Should detect data_capability');
  });

  it('should detect modeling_capability role for repositories', () => {
    const evaluator = new SourceRoleEvaluator();
    const result = evaluator.score({
      type: 'Repository',
      title: 'neuralhydrology - LSTM for rainfall-runoff modeling',
      description: 'A deep learning framework for hydrological simulation and prediction'
    });

    assert.ok(result.roles.modeling_capability >= 0.3, `modeling_capability should be detected, got ${result.roles.modeling_capability}`);
  });

  it('should detect event_signal role for news', () => {
    const evaluator = new SourceRoleEvaluator();
    const result = evaluator.score({
      type: 'News',
      title: 'Major flood disaster in Pakistan',
      description: 'Heavy monsoon rains caused severe flooding across the country'
    });

    assert.ok(result.roles.event_signal >= 0.3, `event_signal should be detected, got ${result.roles.event_signal}`);
  });

  it('should not infer roles from partial source type substrings', () => {
    const evaluator = new SourceRoleEvaluator();
    const result = evaluator.score({
      type: 'Reportage',
      title: 'Magazine profile without structured Digital Earth metadata'
    });

    assert.strictEqual(result.roles.governance_capability, 0, 'Reportage should not match Report');
    assert.strictEqual(result.roles.evidence_assessment, 0, 'Reportage should not match Report');
    assert.strictEqual(result.roles.event_signal, 0, 'Reportage should not match Report');
  });

  it('should detect multiple roles for rich sources', () => {
    const evaluator = new SourceRoleEvaluator();
    const result = evaluator.score({
      type: 'Paper',
      title: 'Climate risk assessment for European river basins',
      abstract: 'We analyze flood and drought risks under climate change scenarios using satellite observations and hydrological models.',
      variables: ['streamflow', 'precipitation'],
      spatialCoverage: 'Europe'
    });

    assert.ok(result.roleCount >= 2, `Should detect multiple roles, got ${result.roleCount}`);
    assert.ok(result.detectedRoles.length >= 2, 'Should have multiple detected roles');
  });
});

describe('Source Type Detection', () => {
  it('should detect DOI as Paper', () => {
    const type = detectSourceType('10.1038/nature12345');
    assert.strictEqual(type, 'Paper');
  });

  it('should detect GitHub URL as Repository', () => {
    const type = detectSourceType('https://github.com/google/flood-forecasting');
    assert.strictEqual(type, 'Repository');
  });

  it('should detect dataset indicators', () => {
    // After removing semantic pattern matching, URLs return 'Source'
    // LLM determines actual type during evaluation
    const type = detectSourceType('https://cds.climate.copernicus.eu/dataset');
    assert.ok(['Source', 'DatasetPage'].includes(type), 'Should be Source (LLM refines) or DatasetPage');
  });

  it('should use metadata type if provided', () => {
    const type = detectSourceType('https://example.com', { type: 'Report' });
    assert.strictEqual(type, 'Report');
  });
});

describe('Activated Ontology', () => {
  it('should activate correct layers for earth_content', () => {
    const roles = { earth_content: 0.5, data_capability: 0, modeling_capability: 0 };
    const activated = getActivatedOntology(roles);

    assert.ok(activated.layers.includes('source'), 'Should include source layer');
    assert.ok(activated.layers.includes('capability'), 'Should include capability layer');
    assert.ok(activated.categories.includes('evidence'), 'Should include evidence category');
  });

  it('should activate world layer for data_capability', () => {
    const roles = { data_capability: 0.5, earth_content: 0, modeling_capability: 0 };
    const activated = getActivatedOntology(roles);

    assert.ok(activated.layers.includes('world'), 'Should include world layer');
    assert.ok(activated.categories.includes('data'), 'Should include data category');
    assert.ok(activated.categories.includes('earth-variable'), 'Should include earth-variable category');
  });

  it('should activate risk categories for governance_capability', () => {
    const roles = { governance_capability: 0.5, action_capability: 0.3 };
    const activated = getActivatedOntology(roles);

    assert.ok(activated.categories.includes('governance'), 'Should include governance category');
    assert.ok(activated.categories.includes('risk'), 'Should include risk category');
  });
});

describe('Source Admission Integration', () => {
  it('should evaluate paper input with Digital Earth roles', async () => {
    const llm = createMockLLM();
    const admission = new SourceAdmission(llm);

    const result = await admission.evaluate('10.1038/nature12345', {
      type: 'Paper',
      title: 'Global flood forecasting using LSTM',
      abstract: 'This paper presents a hydrological model for predicting floods in river basins using deep learning.',
      keywords: ['ml', 'hydrology', 'flood'],
      authors: ['Author 1']
    });

    assert.ok(result.admitted, 'Paper should be admitted');
    assert.ok(result.sourceRoles, 'Should have sourceRoles');
    assert.ok(result.activatedOntologyLayers, 'Should have activatedOntologyLayers');
    assert.ok(result.activatedCategories, 'Should have activatedCategories');
    assert.ok(result.primaryRole, 'Should have primaryRole');
  });

  it('should normalize article metadata type to Paper', async () => {
    const llm = createMockLLM();
    const admission = new SourceAdmission(llm);

    const result = await admission.evaluate('https://publisher.example/articles/example', {
      type: 'article',
      title: 'Global flood forecasting using LSTM',
      abstract: 'This article presents a hydrological model for predicting floods using deep learning.',
      keywords: ['hydrology', 'flood', 'machine learning']
    });

    assert.strictEqual(result.sourceType, 'Paper');
  });

  it('should evaluate GitHub repo with modeling capability', async () => {
    const llm = createMockLLM();
    const admission = new SourceAdmission(llm);

    const result = await admission.evaluate('https://github.com/google/flood-forecasting', {
      type: 'Repository',
      name: 'flood-forecasting',
      language: 'Python',
      stars: 150,
      readme: 'A deep learning framework for flood prediction',
      tree: ['main.py', 'model.py', 'train.py']
    });

    assert.ok(result.admitted, 'GitHub repo should be admitted');
    assert.ok(result.sourceRoles.modeling_capability >= 0.2, 'Should detect modeling capability');
    assert.ok(result.activatedOntologyLayers.includes('capability'), 'Should activate capability layer');
  });

  it('should use connector metadata nested under content.metadata', async () => {
    const admission = new SourceAdmission(null);

    const result = await admission.evaluate('https://github.com/google/flood-forecasting', {
      type: 'Repository',
      name: 'flood-forecasting',
      metadata: {
        datasets: [{ name: 'ERA5-Land' }],
        models: [{ name: 'flood-forecasting' }],
        dependencies: [{ name: 'torch' }]
      }
    });

    assert.ok(result.sourceRoles.data_capability >= 0.2, 'Should detect nested dataset metadata');
    assert.ok(result.activatedCategories.includes('data'), 'Should activate data category');
  });

  it('should evaluate dataset with data capability', async () => {
    // Use admission without LLM to test fallback mode
    const admission = new SourceAdmission(null);

    const result = await admission.evaluate('https://cds.climate.copernicus.eu/era5-land', {
      type: 'DatasetPage',
      title: 'ERA5-Land climate reanalysis',
      variables: ['temperature', 'precipitation', 'evaporation'],
      spatialCoverage: 'global',
      temporalCoverage: '1950-2020'
    });

    assert.ok(result.admitted, 'Dataset should be admitted');
    // Data capability detection from type + variables
    assert.ok(result.sourceRoles.data_capability >= 0.3, `Should detect data capability, got ${result.sourceRoles.data_capability}`);
    assert.ok(result.activatedCategories.includes('data'), 'Should activate data category');
  });

  it('should reject non-Digital Earth content', async () => {
    const llm = createMockLLM();
    const admission = new SourceAdmission(llm);

    const result = await admission.evaluate('https://example.com/random-article', {
      type: 'News',
      title: 'Random Article About Sports'
    });

    assert.strictEqual(result.admitted, false, 'Non-Digital Earth content should not be admitted');
    assert.strictEqual(result.depth, PROCESSING_DEPTHS.REJECT, 'Should be rejected');
  });

  it('should perform quick check', async () => {
    const llm = createMockLLM();
    const admission = new SourceAdmission(llm);

    const result = await admission.quickCheck('10.1038/test-paper');

    assert.ok(result.hasOwnProperty('admitted'), 'Should have admitted property');
    assert.ok(result.hasOwnProperty('depth'), 'Should have depth property');
    assert.ok(result.hasOwnProperty('primaryRole'), 'Should have primaryRole property');
    assert.ok(result.hasOwnProperty('activatedOntologyLayers'), 'Should have activatedOntologyLayers');
  });

  it('should calculate stats from results', async () => {
    const llm = createMockLLM();
    const admission = new SourceAdmission(llm);

    const results = [
      { admitted: true, depth: 'deep', score: 0.8, elapsedMs: 100, sourceRoles: { earth_content: 0.5 } },
      { admitted: true, depth: 'structured', score: 0.5, elapsedMs: 80, sourceRoles: { data_capability: 0.4 } },
      { admitted: false, depth: 'reject', score: 0.1, elapsedMs: 50, sourceRoles: {} }
    ];

    const stats = admission.getStats(results);

    assert.strictEqual(stats.total, 3, 'Should count all results');
    assert.strictEqual(stats.admitted, 2, 'Should count admitted');
    assert.strictEqual(stats.rejected, 1, 'Should count rejected');
    assert.ok(stats.avgScore > 0, 'Should calculate average score');
    assert.ok(stats.byDepth.deep === 1, 'Should count by depth');
  });

  it('should batch evaluate multiple inputs', async () => {
    const llm = createMockLLM();
    const admission = new SourceAdmission(llm);

    const inputs = [
      { input: '10.1038/paper1', metadata: { type: 'Paper', title: 'Flood modeling', abstract: 'Hydrological analysis of river basins' } },
      { input: 'https://github.com/repo', metadata: { type: 'Repository', name: 'hydro-model', description: 'Hydrological simulation model' } }
    ];

    const results = await admission.batchEvaluate(inputs);

    assert.strictEqual(results.length, 2, 'Should return 2 results');
    assert.ok(results[0].admitted, 'Paper should be admitted');
    assert.ok(results[1].admitted, 'Repo should be admitted');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running source admission tests...');
}

module.exports = {};
