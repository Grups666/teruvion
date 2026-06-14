/**
 * MapRecomposer tests
 */

const assert = require('assert');
const { describe, it } = require('../setup');
const { buildMapRecomposition } = require('../../core/project/MapRecomposer');

describe('MapRecomposer', () => {
  it('builds a map plan from generic source objects, results, and evidence', () => {
    const recomposition = buildMapRecomposition({
      decomposition: {
        sourceObject: {
          id: 'paper-1',
          type: 'Paper',
          name: 'Flood risk mapping paper',
          attributes: {
            title: 'Flood risk mapping paper'
          }
        },
        worldObjects: [
          {
            id: 'basin-1',
            type: 'Basin',
            name: 'Example Basin',
            attributes: {
              bbox: [10, 20, 12, 23],
              country: 'Exampleland'
            },
            provenance: {
              section: 'Study area'
            }
          },
          {
            id: 'risk-1',
            type: 'FloodRisk',
            name: 'High flood risk class',
            attributes: {
              classification: 'high',
              bbox: [10, 20, 12, 23],
              temporalCoverage: '2010-2020'
            },
            provenance: {
              section: 'Results'
            }
          }
        ],
        capabilityObjects: [
          {
            id: 'dataset-1',
            type: 'Dataset',
            name: 'Flood inventory',
            attributes: {
              spatialCoverage: [10, 20, 12, 23],
              temporalCoverage: '2010-2020',
              variables: ['flood extent']
            }
          }
        ],
        evidenceObjects: [
          {
            id: 'claim-1',
            type: 'Claim',
            name: 'Risk increased in the basin',
            attributes: {
              statement: 'Risk increased in the basin.',
              confidence: 'medium'
            }
          }
        ],
        visualEvidence: [
          {
            id: 'fig-1',
            kind: 'figure',
            label: 'Figure 3',
            caption: 'Map of classified flood risk by basin.',
            displayPrimitive: 'source-figure-overlay',
            resultId: 'result-paper-1-risk-1',
            imageUrl: 'https://example.test/figure-3.png',
            supportedClaim: 'Risk increased in the basin.'
          }
        ],
        externalResources: [
          {
            type: 'repository',
            label: 'Analysis code',
            url: 'https://github.com/example/flood-risk'
          }
        ]
      }
    });

    assert.strictEqual(recomposition.schemaVersion, 'map-recomposition-v1');
    assert.strictEqual(recomposition.sourceCount, 1);
    assert.ok(recomposition.map.anchors.length >= 2, 'Should expose spatial anchors');
    assert.ok(
      recomposition.map.layers.some(layer => layer.displayPrimitive === 'classified-area-layer'),
      'Should expose a classified area layer'
    );
    assert.ok(
      recomposition.map.attachments.some(item => item.displayPrimitive === 'source-figure-overlay'),
      'Should attach map-like visual evidence'
    );
    assert.ok(
      recomposition.map.attachments.some(item => item.resultId === 'result-paper-1-risk-1'),
      'Should preserve explicit visual-to-result binding'
    );
    assert.ok(
      recomposition.map.attachments.some(item => item.renderability === 'requires-code-execution'),
      'Should record code-backed resources without executing them'
    );
  });

  it('keeps unlocated spatial anchors reviewable instead of fabricating geometry', () => {
    const recomposition = buildMapRecomposition({
      decomposition: {
        sourceObject: {
          id: 'news-1',
          type: 'News',
          name: 'Storm surge report'
        },
        worldObjects: [
          {
            id: 'event-1',
            type: 'Hazard',
            name: 'Storm surge',
            attributes: {
              location: 'southern coast'
            }
          }
        ],
        visualEvidence: []
      }
    });

    const anchor = recomposition.map.anchors.find(item => item.objectId === 'event-1');
    assert.ok(anchor, 'Should keep the hazard as a spatial anchor');
    assert.strictEqual(anchor.renderability, 'spatial-anchor-unlocated');
    assert.strictEqual(recomposition.map.diagnostics.status, 'needs_review');
  });

  it('does not bind visual evidence to results through caption text alone', () => {
    const recomposition = buildMapRecomposition({
      decomposition: {
        sourceObject: {
          id: 'report-1',
          type: 'Report',
          name: 'Regional assessment'
        },
        worldObjects: [
          {
            id: 'indicator-1',
            type: 'Indicator',
            name: 'Crop exposure indicator',
            attributes: {
              value: 'high',
              bbox: [-60, -20, -45, -10]
            }
          }
        ],
        visualEvidence: [
          {
            id: 'figure-1',
            kind: 'figure',
            label: 'Exposure map',
            caption: 'Crop exposure indicator is high across the region.',
            imageUrl: 'https://example.test/exposure.png'
          }
        ]
      }
    });

    const attachment = recomposition.map.attachments.find(item => item.id === 'figure-1');
    assert.ok(attachment, 'Should keep visual evidence as an attachment');
    assert.strictEqual(attachment.resultId, null);
    assert.strictEqual(attachment.anchorId, null);
  });

  it('keeps same-looking sources separate across multi-source map recomposition', () => {
    const recomposition = buildMapRecomposition({
      decompositions: [
        {
          sourceObject: { id: 'source-a', type: 'Dataset', name: 'Daily point feed A' },
          worldObjects: [{
            id: 'feature-a',
            type: 'Region',
            name: 'Shared label',
            attributes: {
              geometry: { type: 'Point', coordinates: [10, 20] }
            }
          }],
          visualEvidence: [{
            id: 'figure-a',
            kind: 'figure',
            label: 'Overview',
            imageUrl: 'https://example.test/overview.png'
          }]
        },
        {
          sourceObject: { id: 'source-b', type: 'Dataset', name: 'Daily point feed B' },
          worldObjects: [{
            id: 'feature-b',
            type: 'Region',
            name: 'Shared label',
            attributes: {
              geometry: { type: 'Point', coordinates: [10, 20] }
            }
          }],
          visualEvidence: [{
            id: 'figure-b',
            kind: 'figure',
            label: 'Overview',
            imageUrl: 'https://example.test/overview.png'
          }]
        }
      ]
    });

    assert.strictEqual(recomposition.sourceCount, 2);
    assert.strictEqual(recomposition.map.anchors.filter(anchor => anchor.label === 'Shared label').length, 2);
    assert.strictEqual(recomposition.map.attachments.filter(item => item.label === 'Overview').length, 2);
  });

  it('supports point, region, and trajectory-like public data shapes without source-specific code', () => {
    const recomposition = buildMapRecomposition({
      decompositions: [
        {
          sourceObject: {
            id: 'usgs-feed',
            type: 'Dataset',
            name: 'USGS all earthquakes GeoJSON feed',
            attributes: {
              sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
            }
          },
          worldObjects: [
            {
              id: 'quake-1',
              type: 'Hazard',
              name: 'Observed earthquake epicenter',
              attributes: {
                coordinates: [-122.8, 38.82],
                magnitude: 2.4,
                date: '2026-06-14'
              },
              provenance: {
                sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
              }
            }
          ]
        },
        {
          sourceObject: {
            id: 'natural-earth',
            type: 'Dataset',
            name: 'Natural Earth countries GeoJSON',
            attributes: {
              sourceUrl: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
            }
          },
          worldObjects: [
            {
              id: 'country-1',
              type: 'Region',
              name: 'Example country boundary',
              attributes: {
                geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [-10, 5],
                    [0, 5],
                    [0, 15],
                    [-10, 15],
                    [-10, 5]
                  ]]
                }
              },
              provenance: {
                sourceUrl: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
              }
            }
          ]
        },
        {
          sourceObject: {
            id: 'ibtracs-feed',
            type: 'Dataset',
            name: 'NOAA IBTrACS recent storm track CSV',
            attributes: {
              sourceUrl: 'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.last3years.list.v04r01.csv'
            }
          },
          worldObjects: [
            {
              id: 'storm-track-1',
              type: 'Hazard',
              name: 'Observed storm track',
              attributes: {
                displayPrimitive: 'route-or-flow-layer',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [170.1, -15.2],
                    [171.5, -16.3],
                    [173.2, -17.4]
                  ]
                },
                temporalCoverage: '2024-01-01/2024-01-03'
              },
              provenance: {
                sourceUrl: 'https://www.ncei.noaa.gov/products/international-best-track-archive'
              }
            }
          ]
        }
      ]
    });

    const primitives = new Set(recomposition.map.layers.map(layer => layer.displayPrimitive));
    assert.ok(primitives.has('point-layer'), 'Should expose point layers');
    assert.ok(primitives.has('region-layer'), 'Should expose region layers');
    assert.ok(primitives.has('route-or-flow-layer'), 'Should expose route or flow layers');
    assert.strictEqual(recomposition.sourceCount, 3);
    assert.strictEqual(recomposition.map.diagnostics.status, 'ready');
  });

  it('builds a product-facing visualization strategy from feature semantics', () => {
    const recomposition = buildMapRecomposition({
      decomposition: {
        sourceObject: {
          id: 'classification-source',
          type: 'Dataset',
          name: 'Regional classification result'
        },
        worldObjects: [
          {
            id: 'region-a',
            type: 'Region',
            name: 'Region A',
            attributes: {
              geometry: {
                type: 'Polygon',
                coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]
              },
              class: 'deficit',
              areaKm2: 1025899,
              monthlyWaterDemand: [3, 4, 5, 7, 6, 9]
            }
          },
          {
            id: 'region-b',
            type: 'Region',
            name: 'Region B',
            attributes: {
              geometry: {
                type: 'Polygon',
                coordinates: [[[3, 0], [5, 0], [5, 2], [3, 2], [3, 0]]]
              },
              class: 'stable',
              areaKm2: 612000,
              monthlyWaterDemand: [2, 3, 3, 4, 4, 5]
            }
          }
        ]
      }
    });

    assert.strictEqual(recomposition.map.viewPlan.schemaVersion, 'map-visualization-strategy-v1');
    assert.strictEqual(recomposition.map.viewPlan.primaryVisual, 'classified-region-map');
    assert.strictEqual(recomposition.map.viewPlan.styling.colorBy, 'class');
    assert.strictEqual(recomposition.map.viewPlan.styling.sizeBy, 'areaKm2');
    assert.ok(
      recomposition.map.viewPlan.inspector.timeSeriesFields.includes('monthlyWaterDemand'),
      'Inspector should expose feature-level time series data'
    );
    assert.strictEqual(recomposition.map.diagnostics.visualizationMode, 'classified-region-map');
  });

  it('uses grounded visualization hints without trusting unavailable fields', () => {
    const recomposition = buildMapRecomposition({
      decomposition: {
        sourceObject: {
          id: 'hinted-source',
          type: 'Dataset',
          name: 'Hinted regional result'
        },
        llmInsights: {
          mapVisualizationHints: [
            {
              visualGoal: 'Color regions by imbalance status and size by area.',
              geometryRole: 'regions',
              colorBy: 'status',
              sizeBy: 'missingMetric',
              timeSeriesFields: ['monthlyStorage', 'missingSeries'],
              sourceGrounding: { section: 'Results' },
              confidence: 0.8
            }
          ]
        },
        worldObjects: [
          {
            id: 'region-a',
            type: 'Region',
            name: 'Region A',
            attributes: {
              geometry: {
                type: 'Polygon',
                coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]
              },
              status: 'imbalanced',
              class: 'deficit',
              areaKm2: 1025899,
              monthlyStorage: [3, 5, 8, 6]
            }
          },
          {
            id: 'region-b',
            type: 'Region',
            name: 'Region B',
            attributes: {
              geometry: {
                type: 'Polygon',
                coordinates: [[[3, 0], [5, 0], [5, 2], [3, 2], [3, 0]]]
              },
              status: 'within range',
              class: 'stable',
              areaKm2: 612000,
              monthlyStorage: [2, 3, 4, 4]
            }
          }
        ]
      }
    });

    assert.strictEqual(recomposition.map.viewPlan.styling.colorBy, 'status');
    assert.strictEqual(recomposition.map.viewPlan.styling.sizeBy, 'areaKm2');
    assert.deepStrictEqual(recomposition.map.viewPlan.inspector.timeSeriesFields, ['monthlyStorage']);
    assert.strictEqual(recomposition.map.viewPlan.agentHints.acceptedCount, 1);
    assert.strictEqual(recomposition.map.viewPlan.agentHints.accepted[0].sizeBy, null);
  });
});
