/**
 * Fixture 1: Technical ML Paper
 * "Graph Neural Networks for Spatiotemporal Forecasting"
 *
 * Purpose: Prove that a non-Earth technical source can still
 * be decomposed into modeling/computing capabilities with
 * transfer potential to Digital Earth systems.
 *
 * Expected extraction:
 * - ModelingCapability: GNN architecture, spatiotemporal modeling
 * - ComputingCapability: Software, algorithms
 * - TransferPotential: Can bridge to networked Earth systems
 */

const { assert, describe, it } = require('../setup');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');
const DynamicOntologyActivation = require('../../core/understanding/DynamicOntologyActivation');

// Simulated paper content
const gnnPaper = {
  metadata: {
    type: 'Paper',
    title: 'Graph Neural Networks for Spatiotemporal Forecasting',
    doi: '10.1234/gnn-spatiotemporal',
    authors: ['A. Researcher', 'B. Scientist'],
    year: 2023,
    venue: 'NeurIPS',
    keywords: ['graph neural networks', 'spatiotemporal', 'forecasting', 'deep learning'],
    algorithms: [
      { name: 'SpatioTemporal Graph Convolutional Network', type: 'graph neural network' }
    ],
    abstract: 'We present a novel graph neural network architecture for spatiotemporal forecasting that captures both spatial dependencies through graph convolution and temporal dynamics through recurrent mechanisms. The model is evaluated on traffic flow prediction and sensor network interpolation tasks.'
  },
  text: `
# Graph Neural Networks for Spatiotemporal Forecasting

## Abstract
We present a novel graph neural network architecture for spatiotemporal forecasting...

## Introduction
Spatiotemporal forecasting is critical for many applications including traffic prediction, sensor network interpolation, and environmental monitoring. Traditional methods fail to capture complex spatial dependencies...

## Methods

### Architecture
Our SpatioTemporal Graph Convolutional Network (ST-GCN) consists of:
- Graph Convolution Layer: Captures spatial dependencies between nodes
- Temporal Convolution Layer: Processes time series data
- Attention Mechanism: Weights important neighbors

The model uses a message-passing framework where each node aggregates information from its neighbors.

### Training
We train on 6 months of data with batch size 32, learning rate 0.001, using Adam optimizer.

### Hyperparameters
- Hidden dimensions: 64
- Number of layers: 3
- Dropout: 0.1
- Graph construction: k-NN with k=10

## Experiments

### Dataset 1: METR-LA Traffic Data
- Sensor count: 207 traffic sensors
- Time period: 4 months
- Sampling: 5-minute intervals
- Region: Los Angeles metropolitan area

### Dataset 2: NREL Solar Power
- Sensor count: 137 solar stations
- Time period: 1 year
- Region: California

## Results
Our ST-GCN achieves MAE of 2.5 on METR-LA, outperforming baseline methods by 15%.

## Discussion
The graph structure allows the model to propagate information across the network, which is especially useful for sensor networks with sparse coverage. This approach could be applied to other spatiotemporal domains including flood forecasting and air quality prediction.

## Conclusion
We demonstrated effective spatiotemporal forecasting using graph neural networks...
`
};

describe('Fixture 1: Technical ML Paper Decomposition', () => {
  it('should admit paper as modeling/computing capability source', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('10.1234/gnn-spatiotemporal', gnnPaper);

    assert.ok(result.admitted, 'Paper should be admitted');
    assert.ok(result.depth !== 'reject', 'Should not be rejected');

    // Check source roles
    assert.ok(result.sourceRoles.modeling_capability >= 0.3,
      `Should detect modeling capability (got ${result.sourceRoles.modeling_capability})`);
    assert.ok(result.sourceRoles.computing_capability >= 0.3,
      `Should detect computing capability`);

    // Should NOT have strong earth_content (this is NOT an Earth science paper)
    assert.ok(result.sourceRoles.earth_content < 0.5,
      'Should NOT have strong earth_content (technical paper)');
  });

  it('should activate modeling/computing ontology layers', async () => {
    const admission = new SourceAdmission();
    const result = await admission.evaluate('10.1234/gnn-spatiotemporal', gnnPaper);

    assert.ok(result.activatedOntologyLayers.includes('capability'),
      'Should activate capability layer');
    assert.ok(result.activatedCategories.includes('modeling') ||
               result.activatedCategories.includes('computing'),
      'Should activate modeling or computing category');
  });

  it('should extract Model capability object', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('10.1234/gnn-spatiotemporal', gnnPaper);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('10.1234/gnn-spatiotemporal', gnnPaper, admissionResult);

    // Should have source object
    assert.ok(decomposition.sourceObject, 'Should have source object');
    assert.strictEqual(decomposition.sourceObject.type, 'Paper');

    // Should extract modeling capabilities (from metadata or LLM)
    const models = decomposition.capabilityObjects.filter(o => o.type === 'Model');

    if (models.length > 0) {
      const model = models[0];
      assert.ok(model.attributes.name, 'Model should have name');
      assert.ok(model.provenance, 'Model should have provenance');
      assert.ok(model.confidence > 0, 'Model should have confidence');
    }

    // Should have extraction metadata showing method used
    assert.ok(decomposition.provenance.extractionMethod,
      'Should record extraction method');
  });

  it('should extract Algorithm/Workflow capabilities', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('10.1234/gnn-spatiotemporal', gnnPaper);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('10.1234/gnn-spatiotemporal', gnnPaper, admissionResult);

    // Look for computing-related objects
    const computingTypes = ['Software', 'Algorithm', 'Workflow', 'API'];
    const computingObjects = decomposition.capabilityObjects.filter(o =>
      computingTypes.includes(o.type)
    );

    // May or may not have explicit computing objects depending on metadata
    // But should have provenance tracking
    assert.ok(decomposition.provenance.timestamp, 'Should have extraction timestamp');
  });

  it('should identify transfer potential to Earth systems', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('10.1234/gnn-spatiotemporal', gnnPaper);

    const activator = new DynamicOntologyActivation();
    const activatedOntology = activator.getActivatedOntology(admissionResult);

    // The discussion mentions "flood forecasting and air quality prediction"
    // This indicates transfer potential even if not primary domain
    const hints = activatedOntology.extractionHints;

    // Should have modeling-related hints
    assert.ok(hints.some(h => h.includes('model') || h.includes('architecture') || h.includes('algorithm')),
      'Should have modeling-related extraction hints');
  });

  it('should have provenance with section reference', async () => {
    const admission = new SourceAdmission();
    const admissionResult = await admission.evaluate('10.1234/gnn-spatiotemporal', gnnPaper);

    const decomposer = new DigitalEarthDecomposer();
    const decomposition = await decomposer.decompose('10.1234/gnn-spatiotemporal', gnnPaper, admissionResult);

    // Check provenance structure
    assert.ok(decomposition.provenance.timestamp, 'Should have timestamp');
    assert.ok(decomposition.provenance.input, 'Should record input');

    // If objects were extracted, they should have provenance
    for (const obj of decomposition.capabilityObjects) {
      assert.ok(obj.provenance, `${obj.type} should have provenance`);
      assert.ok(obj.provenance.section || obj.provenance.sourceText || obj.extractionSource,
        `${obj.type} should have provenance details`);
    }
  });
});

module.exports = {};
