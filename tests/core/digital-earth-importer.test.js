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

  it('should return initial project protocol metadata from import response', async () => {
    const projectRegistry = {
      added: null,
      addProject(project) {
        this.added = project;
        return project.id;
      },
      save() {
        return Promise.resolve();
      }
    };
    const importer = new DigitalEarthImporter(null, null, projectRegistry, null);
    importer._runBackgroundPipeline = async () => {};

    const result = await importer.import('https://example.com/source');

    assert.ok(result.project, 'Import response should include project snapshot');
    assert.strictEqual(result.project.id, result.projectId);
    assert.strictEqual(result.project.metadata.importReadiness.status, 'processing');
    assert.strictEqual(result.project.metadata.importActions[0].id, 'wait-for-import');
    assert.strictEqual(projectRegistry.added.id, result.projectId);
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

  it('should resolve LLM-facing entity type aliases before storage', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    const entity = importer._createEntity({
      id: 'limitation-1',
      type: 'Limitation',
      name: 'Limited evaluation scope',
      attributes: {
        detail: 'The source only reports a limited validation setting.'
      }
    }, 'https://example.com/source', 'project-1');

    assert.strictEqual(entity.type, 'Uncertainty');
    assert.strictEqual(entity.metadata.originalType, 'Limitation');
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

  it('should write project-level recomposition metadata after import decomposition', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    const project = new Project('Importing...', 'Recomposition test', {
      id: 'project-recomposition'
    });
    const decomposition = {
      input: '10.5555/recomposition',
      sourceType: 'Paper',
      sourceObject: {
        id: 'paper-source',
        type: 'Paper',
        name: 'Recomposition paper',
        attributes: { title: 'Recomposition paper' }
      },
      researchBrief: {
        title: 'Recomposition paper',
        oneLine: 'A source is decomposed into a route and visual evidence.'
      },
      workflowOutline: {
        nodes: [{
          id: 'route-node',
          label: 'Source decomposition route',
          stage: 'method',
          summary: 'Route node for recomposition.'
        }],
        edges: []
      },
      capabilityObjects: [{ id: 'method-1' }],
      worldObjects: [{
        id: 'region-1',
        type: 'Region',
        name: 'Example region',
        attributes: {
          bbox: [100, 20, 110, 30]
        }
      }],
      evidenceObjects: [],
      bridgeRelations: [],
      visualEvidence: [{
        id: 'figure-1',
        kind: 'figure',
        label: 'Figure 1',
        caption: 'Map of the study region.',
        imageUrl: 'https://example.com/figure-1.png'
      }],
      externalResources: [],
      extractionIntegrity: {
        status: 'ready',
        routeQuality: { level: 'partial' },
        issues: []
      },
      provenance: { extractionMethod: 'hybrid' },
      confidence: 0.7
    };
    const sourceCoverage = {
      contentLevel: 'full_text',
      label: 'Full text',
      detail: 'Source content available.'
    };

    project.metadata.decomposition = decomposition;
    project.metadata.sourceCoverage = sourceCoverage;
    project.metadata.projectRecomposition = require('../../core/project/ProjectRecomposer')
      .buildProjectRecomposition({ decomposition, sourceCoverage });
    project.metadata.mapRecomposition = require('../../core/project/MapRecomposer')
      .buildMapRecomposition({ decomposition, sourceCoverage });
    importer._updateProjectImportProtocol(project, {
      status: 'completed',
      sourceCoverage,
      decomposition,
      projectRecomposition: project.metadata.projectRecomposition,
      mapRecomposition: project.metadata.mapRecomposition,
      stored: { entities: 2, relations: 1 }
    });

    assert.strictEqual(project.metadata.projectRecomposition.schemaVersion, 'project-recomposition-v1');
    assert.strictEqual(project.metadata.mapRecomposition.schemaVersion, 'map-recomposition-v1');
    assert.strictEqual(project.metadata.projectRecomposition.sourceCount, 1);
    assert.strictEqual(project.metadata.projectRecomposition.sources[0].title, 'Recomposition paper');
    assert.strictEqual(project.metadata.projectRecomposition.aggregate.route.nodeCount, 1);
    assert.ok(project.metadata.mapRecomposition.map.anchors.length >= 1);
    assert.strictEqual(project.metadata.projectRecomposition.map, undefined);
    assert.strictEqual(project.metadata.importReadiness.status, 'review');
  });

  it('should cancel active imports and persist cancelled protocol metadata', () => {
    const project = new Project('Importing...', 'Cancel test', {
      id: 'project-cancel'
    });
    const projectRegistry = {
      getProject(id) {
        return id === project.id ? project : null;
      },
      save() {
        return Promise.resolve();
      }
    };
    const importer = new DigitalEarthImporter(null, null, projectRegistry, null);
    let aborted = false;
    importer.activeAnalyses.set(project.id, {
      abort() {
        aborted = true;
      }
    });

    const cancelled = importer.cancelImport(project.id);

    assert.strictEqual(cancelled, true);
    assert.strictEqual(aborted, true);
    assert.strictEqual(project.analysis.status, 'cancelled');
    assert.strictEqual(project.metadata.importDiagnosis[0].value, 'Cancelled');
    assert.strictEqual(project.metadata.importActions[0].id, 'restart-import');
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

  it('should enrich linked GitHub resources with static reproducibility review', async () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    importer.connectorRegistry = {
      findConnector(url) {
        if (url !== 'https://github.com/example/research-code') return null;
        return {
          getName() {
            return 'GitHubConnector';
          },
          async fetch() {
            return {
              metadata: {
                repositoryReview: {
                  grade: 'B',
                  summary: 'Static review found partial reproducibility material.',
                  checks: {
                    readme: true,
                    license: false,
                    dependencyManifest: true,
                    notebookOrScript: true,
                    dataInstructions: false,
                    dockerfile: false,
                    runInstructions: true
                  },
                  warnings: ['License is missing.']
                }
              }
            };
          }
        };
      }
    };
    const decomposition = {
      externalResources: [{
        type: 'repository',
        label: 'Research code',
        url: 'https://github.com/example/research-code'
      }]
    };

    await importer._enrichLinkedResources(decomposition);

    const resource = decomposition.externalResources[0];
    assert.strictEqual(resource.reproducibilityGrade, 'B');
    assert.ok(resource.reviewHint.includes('Static reproducibility grade B'));
    assert.ok(resource.verificationFocus.includes('license'));
    assert.strictEqual(resource.enrichment.source, 'github-static-review');
  });

  it('should sample linked spatial resources into world objects without source-specific logic', async () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    importer.spatialSampler = {
      canSample(url) {
        return url === 'https://data.example.org/result.geojson';
      },
      async sample() {
        return {
          status: 'sampled',
          format: 'geojson',
          featureCount: 1,
          sampledFeatureCount: 1,
          geoFeatures: [
            {
              id: 'region-a',
              name: 'Region A',
              type: 'Region',
              geometry: {
                type: 'Polygon',
                coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
              },
              displayPrimitive: 'region-layer',
              properties: {
                class: 'flooded',
                impactedPeople: 1200
              },
              confidence: 0.9
            }
          ]
        };
      }
    };

    const decomposition = {
      sourceObject: {
        id: 'paper-1',
        type: 'Paper',
        name: 'Regional result paper'
      },
      worldObjects: [],
      externalResources: [{
        type: 'dataset',
        label: 'Reported result layer',
        url: 'https://data.example.org/result.geojson',
        role: 'result data'
      }]
    };

    await importer._enrichLinkedResources(decomposition);

    assert.strictEqual(decomposition.worldObjects.length, 1);
    assert.strictEqual(decomposition.worldObjects[0].name, 'Region A');
    assert.strictEqual(decomposition.worldObjects[0].attributes.class, 'flooded');
    assert.strictEqual(decomposition.worldObjects[0].provenance.method, 'linked-spatial-sample');
    assert.strictEqual(decomposition.externalResources[0].enrichment.status, 'sampled');
    assert.ok(decomposition.externalResources[0].reviewHint.includes('Linked geojson resource sampled'));
  });

  it('should discover repository-hosted spatial files before bounded sampling', async () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    importer.spatialRepositoryDiscovery = {
      canDiscover(resource) {
        return resource.url === 'https://zenodo.org/records/4315647';
      },
      async discover() {
        return {
          status: 'discovered',
          source: 'spatial-repository-discovery',
          platform: 'zenodo',
          diagnostics: { candidateCount: 1 },
          resources: [{
            type: 'dataset',
            label: 'DDSA dams',
            url: 'https://zenodo.org/api/records/4315647/files/6_ddsa_dams.zip/content',
            format: 'shapefile',
            dataFormat: 'shapefile',
            samplingEligible: true,
            provenance: {
              method: 'repository-file-list',
              parentResourceUrl: 'https://zenodo.org/records/4315647'
            }
          }]
        };
      }
    };
    importer.spatialSampler = {
      canSample(url) {
        return url.endsWith('/6_ddsa_dams.zip/content');
      },
      async sample() {
        return {
          status: 'sampled',
          format: 'shapefile',
          featureCount: 1,
          sampledFeatureCount: 1,
          geoFeatures: [{
            id: 'dam-1',
            name: 'Sample dam',
            type: 'Observation',
            geometry: { type: 'Point', coordinates: [-58.4, -34.6] },
            displayPrimitive: 'point-layer',
            properties: { purpose: 'irrigation', country: 'Argentina' },
            confidence: 0.86
          }]
        };
      }
    };

    const decomposition = {
      sourceObject: {
        id: 'paper-1',
        type: 'Paper',
        name: 'DDSA paper'
      },
      worldObjects: [],
      externalResources: [{
        type: 'dataset',
        label: 'DDSA Zenodo archive',
        url: 'https://zenodo.org/records/4315647'
      }]
    };

    await importer._enrichLinkedResources(decomposition);

    assert.strictEqual(decomposition.externalResources.length, 2);
    assert.strictEqual(decomposition.externalResources[0].discovery.status, 'discovered');
    assert.strictEqual(decomposition.worldObjects.length, 1);
    assert.strictEqual(decomposition.worldObjects[0].name, 'Sample dam');
    assert.strictEqual(decomposition.worldObjects[0].attributes.country, 'Argentina');
    assert.strictEqual(decomposition.externalResources[1].enrichment.status, 'sampled');
  });

  it('should preserve linked raster coverage as reviewable map metadata', async () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    importer.spatialSampler = {
      canSample(url) {
        return url === 'https://data.example.org/result.tif';
      },
      async sample() {
        return {
          status: 'metadata-sampled',
          format: 'geotiff',
          featureCount: 1,
          sampledFeatureCount: 0,
          geoFeatures: [],
          rasterMetadata: {
            width: 100,
            height: 50,
            samplesPerPixel: 1,
            bbox: [-10, -5, 10, 5]
          },
          diagnostics: {}
        };
      }
    };
    const decomposition = {
      sourceObject: {
        id: 'paper-1',
        type: 'Paper',
        name: 'Raster result paper'
      },
      worldObjects: [],
      externalResources: [{
        type: 'dataset',
        label: 'Reported raster',
        url: 'https://data.example.org/result.tif',
        role: 'raster result'
      }]
    };

    await importer._enrichLinkedResources(decomposition);

    assert.strictEqual(decomposition.worldObjects.length, 1);
    assert.deepStrictEqual(decomposition.worldObjects[0].attributes.bbox, [-10, -5, 10, 5]);
    assert.strictEqual(decomposition.worldObjects[0].attributes.displayPrimitive, 'raster-layer');
    assert.strictEqual(decomposition.worldObjects[0].provenance.method, 'linked-spatial-metadata-sample');
    assert.strictEqual(decomposition.externalResources[0].enrichment.status, 'metadata-sampled');
    assert.ok(decomposition.externalResources[0].reviewHint.includes('metadata sampled'));
  });

  it('should geocode source-extracted named locations without fabricating unknown places', async () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    importer.namedLocationResolver = {
      config: { maxLocations: 4 },
      canResolve(object) {
        return object.attributes?.location === 'Corydon, Indiana';
      },
      async resolve() {
        return {
          query: 'Corydon, Indiana',
          displayName: 'Corydon, Harrison County, Indiana, United States',
          coordinates: [-86.1219, 38.2120],
          bbox: [-86.3, 38.1, -86.0, 38.3],
          confidence: 0.65,
          provider: 'nominatim',
          rawType: 'town',
          rawClass: 'place'
        };
      }
    };

    const decomposition = {
      worldObjects: [{
        id: 'event-1',
        type: 'Hazard',
        name: 'Flooding in Corydon',
        attributes: {
          location: 'Corydon, Indiana'
        },
        confidence: 0.8
      }]
    };

    await importer._enrichNamedLocations(decomposition);

    const event = decomposition.worldObjects[0];
    assert.deepStrictEqual(event.attributes.coordinates, [-86.1219, 38.2120]);
    assert.strictEqual(event.attributes.properties.geocodingProvider, 'nominatim');
    assert.strictEqual(event.provenance.geocoding.method, 'external-geocoding');
    assert.strictEqual(event.metadata.geocoding.status, 'resolved');
  });
});
