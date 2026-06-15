/**
 * MapExpressionPlanner tests
 */

const assert = require('assert');
const { describe, it } = require('../setup');
const {
  planMapExpression,
  buildMapPlanningProfile
} = require('../../core/project/MapExpressionPlanner');

describe('MapExpressionPlanner', () => {
  it('profiles only source-grounded spatial fields for map planning', () => {
    const profile = buildMapPlanningProfile({
      sourceObject: { name: 'Spatial source' },
      worldObjects: [{
        id: 'feature-1',
        type: 'Region',
        name: 'Region A',
        attributes: {
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: {
            status: 'active',
            magnitude: 4.2
          }
        }
      }]
    });

    assert.strictEqual(profile.featureCount, 1);
    assert.ok(profile.fieldNames.includes('status'));
    assert.ok(profile.fieldNames.includes('magnitude'));
  });

  it('keeps agent map hints within real field names', async () => {
    const decomposition = {
      llmInsights: { mapVisualizationHints: [] },
      worldObjects: [{
        id: 'feature-1',
        type: 'Observation',
        name: 'Point A',
        attributes: {
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: {
            category: 'event',
            magnitude: 4.2
          }
        }
      }]
    };
    const llm = {
      async chat() {
        return {
          content: JSON.stringify({
            mapVisualizationHints: [{
              visualGoal: 'Show event intensity by point size.',
              geometryRole: 'point events',
              colorBy: 'inventedField',
              sizeBy: 'magnitude',
              inspectorFocus: ['category', 'missingField'],
              sourceGrounding: 'sampled fields',
              confidence: 0.8
            }]
          })
        };
      }
    };

    await planMapExpression({ decomposition, llm });

    const agentHint = decomposition.llmInsights.mapVisualizationHints
      .find(hint => hint.provenance?.method === 'agent-assisted-map-expression-planner');
    assert.ok(agentHint);
    assert.strictEqual(agentHint.colorBy, null);
    assert.strictEqual(agentHint.sizeBy, 'magnitude');
    assert.deepStrictEqual(agentHint.inspectorFocus, ['category']);
    assert.strictEqual(decomposition.mapExpressionPlanning.status, 'agent-assisted');
  });
});
