/**
 * MapExpressionPlanner
 *
 * Optional agent-assisted planning for map expression. The planner is a soft
 * layer: it may suggest color/size/inspector fields, but MapVisualizationStrategy
 * still validates those hints against real decomposition properties.
 */

const { parseLLMJson } = require('../utils/llm-json');

const MAX_FEATURES_FOR_PROMPT = 30;
const MAX_RESOURCES_FOR_PROMPT = 12;

async function planMapExpression({ decomposition = {}, llm = null, timeout = 45000 } = {}) {
  const profile = buildMapPlanningProfile(decomposition);
  const fallbackHints = buildRuleBasedHints(profile);
  ensureInsights(decomposition);

  for (const hint of fallbackHints) {
    appendHint(decomposition, hint);
  }

  if (!llm || profile.featureCount === 0) {
    writePlanningStatus(decomposition, {
      status: 'rule-based',
      reason: profile.featureCount === 0 ? 'no renderable spatial features' : 'llm unavailable',
      acceptedHintCount: fallbackHints.length
    });
    return decomposition;
  }

  try {
    const response = await llm.chat({
      temperature: 0.1,
      max_tokens: 1200,
      timeout,
      messages: [{
        role: 'user',
        content: buildPrompt(profile)
      }]
    });
    const parsed = parseLLMJson(response.content || response.choices?.[0]?.message?.content || '');
    const agentHints = normalizeAgentHints(parsed?.mapVisualizationHints || parsed?.hints || [], profile);

    for (const hint of agentHints) {
      appendHint(decomposition, hint);
    }

    writePlanningStatus(decomposition, {
      status: 'agent-assisted',
      acceptedHintCount: agentHints.length,
      fallbackHintCount: fallbackHints.length
    });
  } catch (error) {
    writePlanningStatus(decomposition, {
      status: 'fallback',
      reason: error.message,
      acceptedHintCount: fallbackHints.length
    });
  }

  return decomposition;
}

function buildMapPlanningProfile(decomposition = {}) {
  const spatialObjects = [
    ...(decomposition.worldObjects || []),
    ...(decomposition.capabilityObjects || [])
  ].filter(hasSpatialSignal);
  const features = spatialObjects.slice(0, MAX_FEATURES_FOR_PROMPT).map(object => {
    const attrs = object.attributes || {};
    const properties = attrs.properties && typeof attrs.properties === 'object'
      ? attrs.properties
      : attrs;
    return {
      id: object.id || object.name || object.type,
      label: object.name || attrs.name || attrs.title || object.type,
      type: object.type,
      geometryType: attrs.geometry?.type || (attrs.bbox ? 'Bbox' : attrs.location || attrs.coordinates ? 'Point' : 'NamedSpatialContext'),
      propertyNames: Object.keys(properties || {}).filter(key => !['geometry', 'bbox', 'location', 'coordinates'].includes(key)).slice(0, 24),
      sampleProperties: summarizeProperties(properties)
    };
  });
  const fieldNames = Array.from(new Set(features.flatMap(feature => feature.propertyNames)));
  const resources = (decomposition.externalResources || []).slice(0, MAX_RESOURCES_FOR_PROMPT).map(resource => ({
    label: resource.label || resource.title || resource.url,
    type: resource.type || resource.kind || 'resource',
    format: resource.format || resource.dataFormat || resource.mediaType || null,
    url: resource.url || null,
    enrichmentStatus: resource.enrichment?.status || null,
    sampledFeatureCount: resource.enrichment?.sampledFeatureCount || 0
  }));

  return {
    sourceTitle: decomposition.sourceObject?.name || decomposition.sourceObject?.title || 'Imported source',
    featureCount: spatialObjects.length,
    sampledFeatureCount: features.length,
    fieldNames,
    features,
    resources
  };
}

function buildRuleBasedHints(profile) {
  if (profile.featureCount === 0) return [];
  const colorBy = chooseField(profile.fieldNames, ['class', 'category', 'status', 'type', 'cluster', 'zone', 'region']);
  const sizeBy = chooseField(profile.fieldNames, ['value', 'count', 'magnitude', 'score', 'area', 'risk', 'impact']);
  return [{
    visualGoal: 'Show the imported spatial objects with source-grounded feature inspection.',
    geometryRole: 'render existing geometry, bbox, or point fields only',
    colorBy,
    sizeBy,
    timeSeriesFields: [],
    inspectorFocus: profile.fieldNames.slice(0, 8),
    sourceGrounding: 'rule-based profile over sampled spatial features',
    confidence: 0.55,
    provenance: {
      method: 'rule-based-map-expression-planner'
    }
  }];
}

function buildPrompt(profile) {
  return [
    'You are planning an interactive Digital Earth map expression from already-extracted source objects.',
    'Use only fields that appear in fieldNames. Do not invent geometry, results, metrics, datasets, or evidence.',
    'Return strict JSON: {"mapVisualizationHints":[{"visualGoal":"","geometryRole":"","colorBy":null,"sizeBy":null,"timeSeriesFields":[],"inspectorFocus":[],"sourceGrounding":"","confidence":0.0}]}',
    'Prefer concise product-facing expression plans: what the map should reveal, which real fields should drive color/size, and which fields belong in the feature inspector.',
    JSON.stringify(profile, null, 2)
  ].join('\n\n');
}

function normalizeAgentHints(hints, profile) {
  const fields = new Set(profile.fieldNames);
  return hints
    .filter(item => item && typeof item === 'object')
    .slice(0, 4)
    .map(item => ({
      visualGoal: String(item.visualGoal || item.goal || '').slice(0, 240),
      geometryRole: String(item.geometryRole || '').slice(0, 160),
      colorBy: fields.has(item.colorBy) ? item.colorBy : null,
      sizeBy: fields.has(item.sizeBy) ? item.sizeBy : null,
      timeSeriesFields: (Array.isArray(item.timeSeriesFields) ? item.timeSeriesFields : []).filter(field => fields.has(field)).slice(0, 4),
      inspectorFocus: (Array.isArray(item.inspectorFocus) ? item.inspectorFocus : []).filter(field => fields.has(field)).slice(0, 10),
      sourceGrounding: String(item.sourceGrounding || 'agent map expression over sampled fields').slice(0, 220),
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.6,
      provenance: {
        method: 'agent-assisted-map-expression-planner'
      }
    }))
    .filter(item => item.visualGoal || item.colorBy || item.sizeBy || item.inspectorFocus.length > 0);
}

function ensureInsights(decomposition) {
  decomposition.llmInsights = decomposition.llmInsights || {};
  decomposition.llmInsights.mapVisualizationHints = Array.isArray(decomposition.llmInsights.mapVisualizationHints)
    ? decomposition.llmInsights.mapVisualizationHints
    : [];
}

function appendHint(decomposition, hint) {
  const key = `${hint.provenance?.method || 'map'}:${hint.visualGoal}:${hint.colorBy || ''}:${hint.sizeBy || ''}`;
  const existing = decomposition.llmInsights.mapVisualizationHints.some(item =>
    `${item.provenance?.method || 'map'}:${item.visualGoal}:${item.colorBy || ''}:${item.sizeBy || ''}` === key
  );
  if (!existing) decomposition.llmInsights.mapVisualizationHints.push(hint);
}

function writePlanningStatus(decomposition, status) {
  decomposition.mapExpressionPlanning = {
    ...status,
    plannedAt: new Date().toISOString()
  };
}

function hasSpatialSignal(object = {}) {
  const attrs = object.attributes || {};
  return Boolean(attrs.geometry || attrs.bbox || attrs.location || attrs.coordinates || attrs.spatialCoverage);
}

function summarizeProperties(properties = {}) {
  const output = {};
  for (const [key, value] of Object.entries(properties).slice(0, 12)) {
    if (['geometry', 'bbox', 'location', 'coordinates'].includes(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      output[key] = value.slice(0, 5);
    } else if (typeof value !== 'object') {
      output[key] = value;
    }
  }
  return output;
}

function chooseField(fields, tokens) {
  return fields.find(field => tokens.some(token => String(field).toLowerCase().includes(token))) || null;
}

module.exports = {
  planMapExpression,
  buildMapPlanningProfile
};
