/**
 * MapVisualizationStrategy
 *
 * Builds a product-facing visualization plan from generic map recomposition
 * objects. This module does not know about one dataset, publisher, paper, or
 * domain. It reads spatial features, attached properties, results, resources,
 * and provenance, then emits a stable plan that the frontend can render.
 *
 * Agent/LLM work should improve this plan through the shared LLM wrapper, not
 * bypass it. The rule-based plan is the safe baseline and schema contract.
 */

const MAX_LEGEND_ITEMS = 8;

function buildMapVisualizationStrategy(input = {}) {
  const anchors = Array.isArray(input.anchors) ? input.anchors : [];
  const results = Array.isArray(input.results) ? input.results : [];
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const visualizationHints = Array.isArray(input.visualizationHints) ? input.visualizationHints : [];
  const renderable = [...anchors, ...results].filter(item => item?.renderability === 'renderable-now');
  const features = renderable.map(normalizeFeature).filter(Boolean);
  const propertyProfile = profileProperties(features);
  const geometryProfile = profileGeometry(features);
  const validatedHints = validateVisualizationHints(visualizationHints, propertyProfile);
  const primaryVisual = choosePrimaryVisual({ features, propertyProfile, geometryProfile });
  const classification = chooseClassification(propertyProfile, validatedHints);
  const metrics = chooseMetrics(propertyProfile, validatedHints);
  const timeSeries = chooseTimeSeries(propertyProfile, validatedHints);
  const legend = buildLegend({ features, classification, metrics, primaryVisual });

  return {
    schemaVersion: 'map-visualization-strategy-v1',
    primaryVisual,
    interaction: {
      selection: 'feature-inspector',
      hover: 'feature-highlight',
      viewport: 'free-pan-zoom',
      detailDepth: timeSeries.fields.length > 0 ? 'feature-with-series' : 'feature-summary'
    },
    styling: {
      colorBy: classification.field,
      sizeBy: metrics.primary?.field || null,
      lineBy: null,
      opacityBy: null,
      palette: classification.field ? 'categorical-soft' : 'semantic-layer'
    },
    legend,
    inspector: {
      titleFields: selectTitleFields(propertyProfile),
      metricFields: metrics.fields.slice(0, 6),
      descriptorFields: propertyProfile.descriptorFields.slice(0, 10).map(field => field.name),
      timeSeriesFields: timeSeries.fields.slice(0, 4),
      evidenceFields: selectEvidenceFields(attachments),
      resourceFields: selectResourceFields(attachments)
    },
    agentHints: {
      acceptedCount: validatedHints.accepted.length,
      rejectedCount: validatedHints.rejected.length,
      accepted: validatedHints.accepted.slice(0, 4),
      rejected: validatedHints.rejected.slice(0, 4)
    },
    diagnostics: {
      featureCount: features.length,
      geometryTypes: geometryProfile.types,
      propertyFieldCount: propertyProfile.fields.length,
      hasCategoricalSignal: Boolean(classification.field),
      hasNumericSignal: metrics.fields.length > 0,
      hasTimeSeriesSignal: timeSeries.fields.length > 0,
      attachmentCount: attachments.length,
      warnings: buildWarnings({ features, propertyProfile, attachments })
    }
  };
}

function normalizeFeature(item) {
  const spatial = item.spatial || {};
  const properties = item.properties && typeof item.properties === 'object' ? item.properties : {};
  const geometryType = spatial.geometry?.type
    || (spatial.point ? 'Point' : spatial.bbox ? 'Bbox' : 'Unknown');
  return {
    id: item.id || item.objectId || item.label,
    label: item.label || item.objectType || 'Map item',
    primitive: item.displayPrimitive || 'spatial-anchor',
    geometryType,
    properties,
    layer: item.layer || 'unknown',
    category: item.category || 'other',
    sourceId: item.sourceId || null
  };
}

function profileProperties(features) {
  const fields = new Map();
  for (const feature of features) {
    for (const [name, value] of Object.entries(feature.properties || {})) {
      if (value === null || value === undefined || value === '') continue;
      const profile = fields.get(name) || {
        name,
        count: 0,
        numericCount: 0,
        categoricalCount: 0,
        seriesCount: 0,
        values: new Map(),
        examples: []
      };
      profile.count += 1;
      if (isNumeric(value)) profile.numericCount += 1;
      if (isPrimitiveCategory(value)) {
        profile.categoricalCount += 1;
        const key = String(value);
        profile.values.set(key, (profile.values.get(key) || 0) + 1);
      }
      if (isNumericArray(value)) profile.seriesCount += 1;
      if (profile.examples.length < 3) profile.examples.push(value);
      fields.set(name, profile);
    }
  }

  const list = Array.from(fields.values()).map(profile => ({
    ...profile,
    distinctCount: profile.values.size,
    coverage: features.length ? profile.count / features.length : 0,
    numericCoverage: features.length ? profile.numericCount / features.length : 0,
    categoricalCoverage: features.length ? profile.categoricalCount / features.length : 0,
    seriesCoverage: features.length ? profile.seriesCount / features.length : 0
  }));

  return {
    fields: list,
    numericFields: list
      .filter(field => field.numericCoverage >= 0.35)
      .sort((a, b) => b.numericCoverage - a.numericCoverage || scoreFieldName(b.name, 'metric') - scoreFieldName(a.name, 'metric')),
    categoricalFields: list
      .filter(field => field.categoricalCoverage >= 0.35 && field.distinctCount >= 2 && field.distinctCount <= Math.max(12, features.length * 0.7))
      .sort((a, b) => scoreFieldName(b.name, 'category') - scoreFieldName(a.name, 'category') || b.categoricalCoverage - a.categoricalCoverage),
    seriesFields: list
      .filter(field => field.seriesCoverage >= 0.15)
      .sort((a, b) => b.seriesCoverage - a.seriesCoverage),
    descriptorFields: list
      .filter(field => field.numericCoverage < 0.35 && field.seriesCoverage < 0.15)
      .sort((a, b) => b.coverage - a.coverage)
  };
}

function profileGeometry(features) {
  const counts = new Map();
  for (const feature of features) {
    counts.set(feature.geometryType, (counts.get(feature.geometryType) || 0) + 1);
  }
  return {
    types: Array.from(counts.keys()),
    counts: Object.fromEntries(counts)
  };
}

function choosePrimaryVisual({ features, propertyProfile, geometryProfile }) {
  if (features.length === 0) return 'source-overview';
  if (propertyProfile.categoricalFields.length > 0 && geometryProfile.types.some(type => /Polygon|Bbox/i.test(type))) {
    return 'classified-region-map';
  }
  if (propertyProfile.numericFields.length > 0 && geometryProfile.types.some(type => /Point/i.test(type))) {
    return 'scaled-point-map';
  }
  if (geometryProfile.types.some(type => /LineString/i.test(type))) return 'route-flow-map';
  if (geometryProfile.types.some(type => /Polygon|Bbox/i.test(type))) return 'regional-feature-map';
  if (geometryProfile.types.some(type => /Point/i.test(type))) return 'point-feature-map';
  return 'spatial-overview';
}

function chooseClassification(propertyProfile, validatedHints) {
  const hintedField = firstExistingField(validatedHints.accepted.map(hint => hint.colorBy), propertyProfile.categoricalFields);
  const field = hintedField || propertyProfile.categoricalFields[0];
  if (!field) return { field: null, values: [] };
  return {
    field: field.name,
    values: Array.from(field.values.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_LEGEND_ITEMS)
      .map(([value, count]) => ({ value, count }))
  };
}

function chooseMetrics(propertyProfile, validatedHints) {
  const hintedField = firstExistingField(validatedHints.accepted.map(hint => hint.sizeBy), propertyProfile.numericFields);
  const ordered = hintedField
    ? [hintedField, ...propertyProfile.numericFields.filter(field => field.name !== hintedField.name)]
    : propertyProfile.numericFields;
  const fields = ordered.map(field => ({
    field: field.name,
    coverage: Number(field.numericCoverage.toFixed(3)),
    role: scoreFieldName(field.name, 'metric') > 0 ? 'primary-measure' : 'measure'
  }));
  return {
    primary: fields[0] || null,
    fields
  };
}

function chooseTimeSeries(propertyProfile, validatedHints) {
  const hinted = validatedHints.accepted
    .flatMap(hint => hint.timeSeriesFields || [])
    .map(name => propertyProfile.seriesFields.find(field => field.name === name))
    .filter(Boolean);
  const ordered = [
    ...hinted,
    ...propertyProfile.seriesFields.filter(field => !hinted.some(item => item.name === field.name))
  ];
  return {
    fields: ordered.map(field => field.name)
  };
}

function buildLegend({ features, classification, metrics, primaryVisual }) {
  if (classification.field) {
    return {
      type: 'category',
      title: humanizeKey(classification.field),
      items: classification.values
    };
  }
  if (metrics.primary) {
    return {
      type: 'numeric-size',
      title: humanizeKey(metrics.primary.field),
      items: []
    };
  }
  return {
    type: features.length > 0 ? 'geometry' : 'empty',
    title: humanizeKey(primaryVisual),
    items: []
  };
}

function selectTitleFields(propertyProfile) {
  const preferred = propertyProfile.fields
    .filter(field => /(^|_|-|\s)(name|title|label|id|code)($|_|-|\s)/i.test(field.name))
    .sort((a, b) => b.coverage - a.coverage)
    .map(field => field.name);
  return preferred.slice(0, 4);
}

function validateVisualizationHints(hints, propertyProfile) {
  const fieldNames = new Set(propertyProfile.fields.map(field => field.name));
  const accepted = [];
  const rejected = [];

  for (const hint of hints) {
    const acceptedHint = {
      visualGoal: hint.visualGoal || '',
      geometryRole: hint.geometryRole || '',
      colorBy: fieldNames.has(hint.colorBy) ? hint.colorBy : null,
      sizeBy: fieldNames.has(hint.sizeBy) ? hint.sizeBy : null,
      timeSeriesFields: (hint.timeSeriesFields || []).filter(field => fieldNames.has(field)),
      inspectorFocus: (hint.inspectorFocus || []).filter(field => fieldNames.has(field)),
      confidence: hint.confidence
    };
    const hasUsableSignal = acceptedHint.colorBy || acceptedHint.sizeBy || acceptedHint.timeSeriesFields.length || acceptedHint.inspectorFocus.length;
    if (hasUsableSignal) accepted.push(acceptedHint);
    else rejected.push({
      visualGoal: hint.visualGoal || '',
      reason: 'hint fields were not present in renderable feature properties'
    });
  }

  return { accepted, rejected };
}

function firstExistingField(names, fields) {
  for (const name of names) {
    if (!name) continue;
    const match = fields.find(field => field.name === name);
    if (match) return match;
  }
  return null;
}

function selectEvidenceFields(attachments) {
  return attachments
    .filter(item => ['figure', 'table', 'chart', 'map', 'plot'].includes(String(item.kind || '').toLowerCase()))
    .slice(0, 6)
    .map(item => ({
      id: item.id,
      label: item.label,
      kind: item.kind,
      sourceUrl: item.evidence?.sourceUrl || item.evidence?.imageUrl || null
    }));
}

function selectResourceFields(attachments) {
  return attachments
    .filter(item => ['dataset', 'data', 'repository', 'code', 'supplement'].includes(String(item.kind || '').toLowerCase()))
    .slice(0, 8)
    .map(item => ({
      id: item.id,
      label: item.label,
      kind: item.kind,
      url: item.evidence?.url || null,
      renderability: item.renderability
    }));
}

function buildWarnings({ features, propertyProfile, attachments }) {
  const warnings = [];
  if (features.length === 0) {
    warnings.push('No renderable spatial features are available yet.');
  }
  if (features.length > 0 && propertyProfile.fields.length === 0) {
    warnings.push('Spatial features have geometry but no inspectable attributes.');
  }
  const dataLikeAttachment = attachments.some(item => ['dataset', 'data'].includes(String(item.kind || '').toLowerCase()));
  if (dataLikeAttachment && features.length === 0) {
    warnings.push('Data resources were found, but no map-ready result layer has been assembled.');
  }
  return warnings;
}

function isNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  if (!value.trim()) return false;
  return Number.isFinite(Number(value));
}

function isPrimitiveCategory(value) {
  return typeof value === 'string' || typeof value === 'boolean';
}

function isNumericArray(value) {
  return Array.isArray(value) && value.length >= 3 && value.some(item => Number.isFinite(Number(item)));
}

function scoreFieldName(name, mode) {
  const text = String(name || '').toLowerCase();
  const metricTokens = ['value', 'metric', 'score', 'index', 'rate', 'area', 'count', 'total', 'mean', 'median', 'risk', 'hazard', 'magnitude'];
  const categoryTokens = ['class', 'category', 'status', 'type', 'cluster', 'group', 'zone', 'region', 'basin', 'continent'];
  const tokens = mode === 'category' ? categoryTokens : metricTokens;
  return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
}

function humanizeKey(key) {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

module.exports = {
  buildMapVisualizationStrategy
};
