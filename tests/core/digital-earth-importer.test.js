/**
 * DigitalEarthImporter tests
 */

const { assert, describe, it } = require('../setup');
const DigitalEarthImporter = require('../../src/server/digital-earth-importer');
const { TripleStore } = require('../../core/registry/TripleStore');
const { Project } = require('../../core/project/Project');

describe('DigitalEarthImporter', () => {
  it('should classify inputs through connector routing where possible', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);

    assert.strictEqual(importer._identifyInputType('https://github.com/Grups666/teruvion'), 'git_hub');
    assert.strictEqual(importer._identifyInputType('10.1038/s41586-024-07145-1'), 'paper');
  });

  it('should keep generic URLs and text generic when no connector claims them', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);

    assert.strictEqual(importer._identifyInputType('ftp://example.com/resource'), 'text');
    assert.strictEqual(importer._identifyInputType('short title'), 'text');
  });

  it('should preserve decomposed object metadata when creating store entities', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    const entity = importer._createEntity({
      type: 'Dataset',
      attributes: {
        name: 'Fallback dataset'
      },
      metadata: {
        sourceDerived: true,
        confidence: 0.5,
        reviewStatus: 'needs-review'
      },
      provenance: {
        section: 'data availability',
        sourceText: 'Dataset availability is described in the source text.'
      }
    }, 'https://example.com/paper', 'project-1');

    assert.strictEqual(entity.metadata.sourceDerived, true);
    assert.strictEqual(entity.metadata.confidence, 0.5);
    assert.strictEqual(entity.metadata.reviewStatus, 'needs-review');
    assert.strictEqual(entity.metadata.source, 'https://example.com/paper');
    assert.strictEqual(entity.metadata.projectId, 'project-1');
    assert.strictEqual(entity.metadata.provenance.section, 'data availability');
  });

  it('should preserve decomposer object ids as store entity ids', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    const entity = importer._createEntity({
      id: 'dataset-era5',
      type: 'Dataset',
      attributes: {
        name: 'ERA5-Land'
      }
    }, 'https://example.com/source', 'project-1');

    assert.strictEqual(entity.id, 'dataset-era5');
  });

  it('should write import protocol metadata for processing and failed projects', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    const project = new Project('Importing...', 'Protocol test', {
      id: 'project-protocol'
    });

    importer._updateProjectImportProtocol(project, { status: 'analyzing' });

    assert.strictEqual(project.metadata.importReadiness.status, 'processing');
    assert.strictEqual(project.metadata.importActions[0].id, 'wait-for-import');

    importer._updateProjectImportProtocol(project, {
      status: 'failed',
      error: 'Source rejected'
    });

    assert.strictEqual(project.metadata.importDiagnosis[0].value, 'Failed');
    assert.strictEqual(project.metadata.importReadiness.status, 'blocked');
    assert.strictEqual(project.metadata.importActions[0].id, 'fix-import-failure');
  });

  it('should resolve bridge relations from decomposer ids', async () => {
    const store = new TripleStore(':memory:');
    const importer = new DigitalEarthImporter(store, null, null, null);
    const project = new Project('Bridge test', 'Bridge relation resolution', {
      id: 'project-bridge'
    });

    const stored = await importer._storeDecomposition(project, {
      sourceObject: {
        id: 'paper-source',
        type: 'Paper',
        attributes: {
          title: 'Example source paper'
        }
      },
      capabilityObjects: [
        {
          id: 'dataset-era5',
          type: 'Dataset',
          attributes: {
            name: 'ERA5-Land'
          }
        }
      ],
      worldObjects: [
        {
          id: 'region-global',
          type: 'Region',
          attributes: {
            name: 'Global scope'
          }
        }
      ],
      evidenceObjects: [],
      bridgeRelations: [
        {
          type: 'covers',
          from: 'dataset-era5',
          to: 'region-global',
          confidence: 0.7,
          provenance: {
            section: 'data'
          }
        }
      ]
    }, 'https://example.com/source');

    assert.strictEqual(stored.entities, 3);
    assert.ok(store.hasEntity('dataset-era5'));
    assert.ok(store.hasEntity('region-global'));
    assert.ok(store.getAllTriples().some(triple =>
      triple.subject === 'dataset-era5' &&
      triple.predicate === 'covers' &&
      triple.object === 'region-global'
    ));
  });
});
