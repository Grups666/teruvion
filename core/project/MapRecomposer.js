/**
 * MapRecomposer
 *
 * Builds a map-ready, source-grounded view from existing decomposition or entity
 * graph state. This module does not infer new facts, call LLMs, geocode names,
 * or execute source code. It only classifies what can be spatially displayed,
 * what can be attached to spatial anchors, and what must stay in review state.
 *
 * Design invariants:
 * - Map visualization is a recomposition over the shared decomposition contract.
 * - Source, publisher, repository, and domain-specific handling belongs upstream.
 * - Semantic binding must be explicit in structured fields, not caption matching.
 */

const ontology = require('../registry/ontology');
const {
  DISPLAY_PRIMITIVES,
  normalizeDisplayPrimitive,
  labelForDisplayPrimitive,
  primitiveFromGeometry,
  geometryKind,
  inferFormatFromUrl,
  primitiveFromFormat
} = require('./RecompositionSemantics');
const { buildMapVisualizationStrategy } = require('./MapVisualizationStrategy');

const SPATIAL_FIELDS = [
  'geometry',
  'bbox',
  'centroid',
  'location',
  'coordinates',
  'spatialCoverage',
  'coverage'
];

const TEMPORAL_FIELDS = [
  'temporalCoverage',
  'timeRange',
  'date',
  'year',
  'start',
  'end',
  'validTime',
  'issueTime'
];

const RESULT_CATEGORIES = new Set([
  'risk',
  'hazard',
  'model-output',
  'scenario',
  'evidence',
  'socioeconomic',
  'resource',
  'earth-variable',
  'exposure'
]);

const ATTACHABLE_VISUAL_KINDS = new Set(['figure', 'table', 'chart', 'map', 'plot']);

function buildMapRecomposition(input = {}) {
  const sources = normalizeSources(input);
  const mapSources = sources.map((source, index) => buildSourceMap(source, index));
  const anchors = dedupeByKey(mapSources.flatMap(source => source.anchors), anchorKey);
  const results = dedupeByKey(mapSources.flatMap(source => source.results), resultKey);
  const attachments = dedupeByKey(mapSources.flatMap(source => source.attachments), attachmentKey);
  const layers = buildLayers(anchors, results);
  const visualizationHints = mapSources.flatMap(source => source.visualizationHints || []);
  const viewPlan = buildMapVisualizationStrategy({ anchors, results, attachments, layers, visualizationHints });
  const diagnostics = buildDiagnostics({
    anchors,
    results,
    attachments,
    sources: mapSources,
    viewPlan
  });

  return {
    schemaVersion: 'map-recomposition-v1',
    generatedAt: new Date().toISOString(),
    sourceCount: mapSources.length,
    sources: mapSources.map(source => source.summary),
    map: {
      primaryMode: choosePrimaryMode(layers, anchors, attachments),
      anchors,
      layers,
      attachments,
      results,
      viewPlan,
      diagnostics
    }
  };
}

function normalizeSources(input = {}) {
  const decompositions = Array.isArray(input.decompositions)
    ? input.decompositions
    : input.decomposition
      ? [input.decomposition]
      : [];
  const entities = Array.isArray(input.entities) ? input.entities : [];
  const lenses = Array.isArray(input.mapLenses)
    ? input.mapLenses
    : input.mapLens
      ? [input.mapLens]
      : [];

  if (decompositions.length === 0 && entities.length > 0) {
    return [{
      decomposition: decompositionFromEntities(entities),
      mapLens: lenses[0] || null,
      sourceCoverage: input.sourceCoverage || null,
      admission: input.admission || null
    }];
  }

  return decompositions.map((decomposition, index) => ({
    decomposition,
    mapLens: lenses[index] || lenses[0] || null,
    sourceCoverage: Array.isArray(input.sourceCoverages)
      ? input.sourceCoverages[index]
      : input.sourceCoverage || null,
    admission: Array.isArray(input.admissions)
      ? input.admissions[index]
      : input.admission || null
  }));
}

function decompositionFromEntities(entities) {
  const sourceObject = entities.find(entity => getLayer(entity.type) === 'source') || null;
  return {
    sourceObject: sourceObject ? entityToObject(sourceObject) : null,
    capabilityObjects: entities.filter(entity => getLayer(entity.type) === 'capability').map(entityToObject),
    worldObjects: entities.filter(entity => getLayer(entity.type) === 'world' || getLayer(entity.type) === 'domain').map(entityToObject),
    evidenceObjects: entities.filter(entity => getLayer(entity.type) === 'foundation').map(entityToObject),
    visualEvidence: []
  };
}

function entityToObject(entity) {
  return {
    id: entity.id,
    type: entity.type,
    name: typeof entity.getDisplayName === 'function'
      ? entity.getDisplayName()
      : entity.attributes?.name || entity.attributes?.title || entity.id,
    attributes: entity.attributes || {},
    metadata: entity.metadata || {},
    provenance: entity.metadata?.provenance || entity.provenance || null
  };
}

function buildSourceMap(source, index) {
  const decomposition = source.decomposition || {};
  const sourceObject = decomposition.sourceObject || {};
  const sourceId = sourceObject.id || `source-${index + 1}`;
  const sourceTitle = titleForObject(sourceObject, `Source ${index + 1}`);
  const objects = collectObjects(decomposition);
  const anchors = [];
  const results = [];

  for (const object of objects) {
    const layer = getLayer(object.type);
    const category = getCategory(object.type);
    const spatial = readSpatialBinding(object);
    const common = {
      sourceId,
      sourceTitle,
      objectId: object.id || null,
      objectType: object.type || 'Entity',
      label: titleForObject(object, object.type || 'Entity'),
      provenance: object.provenance || object.metadata?.provenance || null,
      confidence: readConfidence(object),
      properties: readInspectableProperties(object),
      sourceUrl: attributesOf(object).sourceUrl || object.provenance?.sourceUrl || object.metadata?.sourceUrl || null
    };

    if (isSpatialAnchorCandidate(layer, category, spatial)) {
      anchors.push({
        id: stableId('anchor', sourceId, object.id || object.name || common.label),
        ...common,
        layer,
        category,
        spatial,
        renderability: spatial.geometry || spatial.bbox || spatial.point
          ? 'renderable-now'
          : 'spatial-anchor-unlocated',
        displayPrimitive: chooseAnchorPrimitive(spatial, category)
      });
    }

    if (isResultCandidate(layer, category, object)) {
      results.push({
        id: stableId('result', sourceId, object.id || object.name || common.label),
        ...common,
        layer,
        category,
        variable: readVariable(object),
        value: readResultValue(object),
        temporal: readTemporalBinding(object),
        spatial,
        renderability: chooseResultRenderability(object, spatial),
        displayPrimitive: chooseResultPrimitive(object, spatial, category)
      });
    }
  }

  const lensAnchors = anchorsFromMapLens(source.mapLens, sourceId, sourceTitle);
  const mergedAnchors = dedupeByKey([...anchors, ...lensAnchors], anchorKey);
  const attachments = buildAttachments({
    sourceId,
    sourceTitle,
    decomposition,
    anchors: mergedAnchors,
    results
  });

  return {
    summary: {
      id: sourceId,
      title: sourceTitle,
      type: sourceObject.type || decomposition.sourceType || 'Source',
      coverage: source.sourceCoverage ? {
        level: source.sourceCoverage.contentLevel || null,
        label: source.sourceCoverage.label || null
      } : null,
      admission: source.admission ? {
        depth: source.admission.depth || null,
        primaryRole: source.admission.primaryRole || null
      } : null
    },
    anchors: mergedAnchors,
    results,
    attachments,
    visualizationHints: normalizeVisualizationHints(decomposition.llmInsights?.mapVisualizationHints)
  };
}

function normalizeVisualizationHints(hints) {
  if (!Array.isArray(hints)) return [];
  return hints
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      visualGoal: item.visualGoal || item.goal || item.summary || '',
      geometryRole: item.geometryRole || item.geometry || '',
      colorBy: item.colorBy || item.classificationField || null,
      sizeBy: item.sizeBy || item.metricField || null,
      timeSeriesFields: Array.isArray(item.timeSeriesFields) ? item.timeSeriesFields : [],
      inspectorFocus: Array.isArray(item.inspectorFocus) ? item.inspectorFocus : [],
      sourceGrounding: item.sourceGrounding || item.provenance || null,
      confidence: typeof item.confidence === 'number' ? item.confidence : null
    }));
}

function collectObjects(decomposition = {}) {
  return [
    decomposition.sourceObject,
    ...(decomposition.worldObjects || []),
    ...(decomposition.capabilityObjects || []),
    ...(decomposition.evidenceObjects || [])
  ].filter(Boolean);
}

function anchorsFromMapLens(mapLens, sourceId, sourceTitle) {
  const features = Array.isArray(mapLens?.features) ? mapLens.features : [];
  return features.map(feature => ({
    id: stableId('anchor', sourceId, feature.id || feature.properties?.id || feature.properties?.name),
    sourceId,
    sourceTitle,
    objectId: feature.properties?.id || feature.id || null,
    objectType: feature.properties?.type || 'Entity',
    label: feature.properties?.name || feature.properties?.label || feature.id || 'Spatial feature',
    layer: feature.properties?.layer || 'unknown',
    category: feature.properties?.category || 'other',
    spatial: {
      kind: geometryKind(feature.geometry),
      geometry: feature.geometry || null,
      bbox: null,
      point: null,
      label: feature.properties?.name || null
    },
    renderability: 'renderable-now',
    displayPrimitive: primitiveFromGeometry(feature.geometry),
    provenance: null,
    confidence: null
  }));
}

function buildAttachments(input) {
  const visuals = input.decomposition.visualEvidence || [];
  const resources = input.decomposition.externalResources || [];
  const attachments = [];

  for (const [index, visual] of visuals.entries()) {
    const kind = String(visual.kind || 'figure').toLowerCase();
    if (!ATTACHABLE_VISUAL_KINDS.has(kind)) continue;

    const displayHint = readDisplayHint(visual);
    const displayPrimitive = displayHint.primitive
      || (isTableVisual(visual) ? 'attached-table' : 'attached-chart-or-figure');

    attachments.push({
      id: visual.id || stableId('visual', input.sourceId, index + 1),
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      anchorId: explicitAnchorIdForAttachment(visual, input.anchors),
      resultId: explicitResultIdForAttachment(visual, input.results),
      label: visual.label || visual.title || `Visual ${index + 1}`,
      kind,
      displayPrimitive,
      renderability: visual.imageUrl || visual.cachedImage || visual.tableData
        ? 'renderable-now'
        : 'source-figure-only',
      provenance: visual.provenance || null,
      evidence: {
        caption: visual.caption || '',
        imageUrl: visual.imageUrl || visual.cachedImage?.localUrl || null,
        sourceUrl: visual.sourceUrl || null,
        supports: visual.supportedClaim || visual.supports || ''
      }
    });
  }

  for (const [index, resource] of resources.entries()) {
    const displayPrimitive = resourcePrimitive(resource);
    attachments.push({
      id: resource.id || stableId('resource', input.sourceId, resource.url || resource.label || index + 1),
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      anchorId: explicitAnchorIdForAttachment(resource, input.anchors),
      resultId: null,
      label: resource.label || resource.url || `Resource ${index + 1}`,
      kind: String(resource.type || 'resource').toLowerCase(),
      displayPrimitive,
      renderability: resourceRenderability(resource, displayPrimitive),
      provenance: resource.provenance || null,
      evidence: {
        url: resource.url || null,
        role: resource.role || resource.context || '',
        reviewHint: resource.reviewHint || resource.verificationFocus || ''
      }
    });
  }

  return attachments;
}

function buildLayers(anchors, results) {
  const renderableAnchors = anchors.filter(anchor => anchor.renderability === 'renderable-now');
  const directResults = results.filter(result => result.renderability === 'renderable-now');
  const layers = [];

  for (const primitive of [
    DISPLAY_PRIMITIVES.REGION_LAYER,
    DISPLAY_PRIMITIVES.POINT_LAYER,
    DISPLAY_PRIMITIVES.ROUTE_OR_FLOW_LAYER,
    DISPLAY_PRIMITIVES.RASTER_LAYER,
    DISPLAY_PRIMITIVES.CLASSIFIED_AREA_LAYER
  ]) {
    const layerAnchors = renderableAnchors.filter(anchor => anchor.displayPrimitive === primitive);
    const layerResults = directResults.filter(result => result.displayPrimitive === primitive);
    if (layerAnchors.length === 0 && layerResults.length === 0) continue;

    layers.push({
      id: primitive,
      displayPrimitive: primitive,
      label: layerLabel(primitive),
      anchorCount: layerAnchors.length,
      resultCount: layerResults.length,
      anchorIds: layerAnchors.map(anchor => anchor.id),
      resultIds: layerResults.map(result => result.id),
      evidenceRequired: true
    });
  }

  const attached = results.filter(result => result.displayPrimitive.startsWith('attached-'));
  if (attached.length > 0) {
    layers.push({
      id: DISPLAY_PRIMITIVES.ATTACHED_RESULTS,
      displayPrimitive: DISPLAY_PRIMITIVES.ATTACHED_RESULTS,
      label: labelForDisplayPrimitive(DISPLAY_PRIMITIVES.ATTACHED_RESULTS),
      anchorCount: anchors.length,
      resultCount: attached.length,
      anchorIds: anchors.map(anchor => anchor.id),
      resultIds: attached.map(result => result.id),
      evidenceRequired: true
    });
  }

  return layers;
}

function buildDiagnostics(input) {
  const renderableAnchors = input.anchors.filter(anchor => anchor.renderability === 'renderable-now').length;
  const unlocatedAnchors = input.anchors.filter(anchor => anchor.renderability !== 'renderable-now').length;
  const renderableResults = input.results.filter(result => result.renderability === 'renderable-now').length;
  const attachedResults = input.results.filter(result => result.displayPrimitive.startsWith('attached-')).length;
  const blockedResults = input.results.filter(result => result.renderability === 'requires-code-execution').length;
  const figureOnly = input.attachments.filter(attachment => attachment.renderability === 'source-figure-only').length;
  const warnings = [];

  if (input.anchors.length === 0) {
    warnings.push('No spatial anchors were found; global map should stay as a source overview.');
  } else if (renderableAnchors === 0) {
    warnings.push('Spatial anchors exist but lack geometry, bbox, point, or coverage metadata.');
  }

  if (input.results.length > 0 && renderableResults === 0 && attachedResults === 0) {
    warnings.push('Results were detected, but none are directly map-renderable yet.');
  }

  if (blockedResults > 0) {
    warnings.push(`${blockedResults} result candidates require code execution or unavailable derived data.`);
  }

  return {
    status: warnings.length > 0 ? 'needs_review' : 'ready',
    anchorCount: input.anchors.length,
    renderableAnchorCount: renderableAnchors,
    unlocatedAnchorCount: unlocatedAnchors,
    resultCount: input.results.length,
    renderableResultCount: renderableResults,
    attachedResultCount: attachedResults,
    attachmentCount: input.attachments.length,
    sourceFigureOnlyCount: figureOnly,
    visualizationMode: input.viewPlan?.primaryVisual || null,
    warnings
  };
}

function isSpatialAnchorCandidate(layer, category, spatial) {
  if (layer === 'world' || layer === 'domain') return true;
  if (category === 'observation' || category === 'data' || category === 'socioeconomic') {
    return Boolean(spatial.hasSignal);
  }
  return false;
}

function isResultCandidate(layer, category, object) {
  if (RESULT_CATEGORIES.has(category)) return true;
  if (['ModelOutput', 'Forecast', 'Projection', 'Indicator', 'Metric', 'Claim', 'Assessment'].includes(object.type)) return true;
  const attrs = attributesOf(object);
  return Boolean(
    attrs.value ||
    attrs.metric ||
    attrs.result ||
    attrs.finding ||
    attrs.outputs ||
    attrs.riskMap ||
    attrs.classification
  );
}

function readSpatialBinding(object) {
  const attrs = attributesOf(object);
  const geometry = attrs.geometry || null;
  const bbox = normalizeBbox(attrs.bbox || attrs.spatialCoverage || attrs.bounds);
  const point = normalizePoint(attrs.centroid || attrs.location || attrs.coordinates);
  const label = stringifyFirst([
    attrs.region,
    attrs.country,
    attrs.basin,
    attrs.area,
    attrs.spatialExtent,
    attrs.spatialCoverage
  ]);

  return {
    kind: geometry ? geometryKind(geometry) : bbox ? 'bbox' : point ? 'point' : label ? 'named-scope' : 'none',
    geometry,
    bbox,
    point,
    label,
    hasSignal: Boolean(geometry || bbox || point || label)
  };
}

function readTemporalBinding(object) {
  const attrs = attributesOf(object);
  const values = {};
  for (const field of TEMPORAL_FIELDS) {
    if (attrs[field] !== undefined && attrs[field] !== null && attrs[field] !== '') {
      values[field] = attrs[field];
    }
  }
  return Object.keys(values).length > 0 ? values : null;
}

function readVariable(object) {
  const attrs = attributesOf(object);
  return stringifyFirst([
    attrs.variable,
    attrs.variables,
    attrs.indicator,
    attrs.metric,
    attrs.standardName,
    attrs.longName,
    object.type
  ]);
}

function readResultValue(object) {
  const attrs = attributesOf(object);
  return stringifyFirst([
    attrs.value,
    attrs.result,
    attrs.finding,
    attrs.classification,
    attrs.riskMap,
    attrs.outputs,
    attrs.performance,
    attrs.trend,
    attrs.impact
  ]);
}

function readConfidence(object) {
  const value = object.confidence ?? object.metadata?.confidence;
  return typeof value === 'number' ? value : null;
}

function readInspectableProperties(object) {
  const attrs = attributesOf(object);
  const raw = attrs.properties && typeof attrs.properties === 'object' && !Array.isArray(attrs.properties)
    ? attrs.properties
    : attrs;
  const excluded = new Set([
    'geometry',
    'bbox',
    'bounds',
    'centroid',
    'location',
    'coordinates',
    'spatialCoverage',
    'coverage',
    'properties'
  ]);
  const entries = Object.entries(raw)
    .filter(([key, value]) => !excluded.has(key) && value !== null && value !== undefined && value !== '')
    .filter(([, value]) => typeof value !== 'object' || Array.isArray(value))
    .slice(0, 18);
  return Object.fromEntries(entries);
}

function chooseAnchorPrimitive(spatial, category) {
  if (spatial.geometry) return primitiveFromGeometry(spatial.geometry);
  if (spatial.bbox) return DISPLAY_PRIMITIVES.REGION_LAYER;
  if (spatial.point) return DISPLAY_PRIMITIVES.POINT_LAYER;
  if (category === 'earth-variable' || category === 'model-output') return DISPLAY_PRIMITIVES.ATTACHED_CHART_OR_VALUE;
  return DISPLAY_PRIMITIVES.SPATIAL_ANCHOR;
}

function chooseResultPrimitive(object, spatial, category) {
  const attrs = attributesOf(object);
  const displayHint = readDisplayHint(object);
  if (displayHint.primitive) return displayHint.primitive;

  if (hasRasterSignal(attrs)) {
    return DISPLAY_PRIMITIVES.RASTER_LAYER;
  }
  if (attrs.classification || attrs.classes || attrs.riskMap) return DISPLAY_PRIMITIVES.CLASSIFIED_AREA_LAYER;
  if (spatial.geometry || spatial.bbox) return DISPLAY_PRIMITIVES.REGION_LAYER;
  if (spatial.point) return DISPLAY_PRIMITIVES.POINT_LAYER;
  if (readTemporalBinding(object)) return DISPLAY_PRIMITIVES.ATTACHED_TIME_SERIES;
  if (readResultValue(object)) return DISPLAY_PRIMITIVES.ATTACHED_CHART_OR_VALUE;
  return DISPLAY_PRIMITIVES.EVIDENCE_CHAIN_VIEW;
}

function chooseResultRenderability(object, spatial) {
  const attrs = attributesOf(object);
  if (attrs.requiresExecution || attrs.executionRequired || attrs.codeRequired) {
    return 'requires-code-execution';
  }
  if (spatial.geometry || spatial.bbox || spatial.point) return 'renderable-now';
  if (readTemporalBinding(object) || readResultValue(object)) return 'renderable-as-attachment';
  return 'not-renderable';
}

function choosePrimaryMode(layers, anchors, attachments) {
  if (layers.some(layer => layer.displayPrimitive === DISPLAY_PRIMITIVES.CLASSIFIED_AREA_LAYER)) return 'classified-map';
  if (layers.some(layer => layer.displayPrimitive === DISPLAY_PRIMITIVES.RASTER_LAYER)) return 'raster-map';
  if (layers.some(layer => layer.displayPrimitive === DISPLAY_PRIMITIVES.ROUTE_OR_FLOW_LAYER)) return 'route-map';
  if (layers.some(layer => layer.displayPrimitive === DISPLAY_PRIMITIVES.REGION_LAYER)) return 'regional-map';
  if (layers.some(layer => layer.displayPrimitive === DISPLAY_PRIMITIVES.POINT_LAYER)) return 'point-map';
  if (attachments.length > 0 && anchors.length > 0) return 'map-with-attachments';
  if (anchors.length > 0) return 'spatial-overview';
  return 'global-source-overview';
}

function resourcePrimitive(resource = {}) {
  const displayHint = readDisplayHint(resource);
  if (displayHint.primitive) return displayHint.primitive;

  const format = String(resource.format || resource.dataFormat || resource.mediaType || '').toLowerCase();
  const urlFormat = inferFormatFromUrl(resource.url);
  const normalizedFormat = format || urlFormat;
  const primitive = primitiveFromFormat(normalizedFormat);
  if (primitive) return primitive;
  if (String(resource.type || '').toLowerCase() === 'repository') return DISPLAY_PRIMITIVES.WORKFLOW_RESOURCE;
  return DISPLAY_PRIMITIVES.EVIDENCE_RESOURCE;
}

function resourceRenderability(resource, primitive) {
  if (!resource?.url) return 'not-renderable';
  if (
    primitive === DISPLAY_PRIMITIVES.RASTER_LAYER ||
    primitive === DISPLAY_PRIMITIVES.REGION_LAYER ||
    primitive === DISPLAY_PRIMITIVES.ATTACHED_TABLE
  ) {
    return 'renderable-with-light-processing';
  }
  if (primitive === DISPLAY_PRIMITIVES.WORKFLOW_RESOURCE) return 'requires-code-execution';
  return 'source-figure-only';
}

function isTableVisual(visual = {}) {
  return String(visual.kind || '').toLowerCase() === 'table' || Boolean(visual.tableData);
}

function explicitResultIdForAttachment(visual, results) {
  const ids = new Set(results.flatMap(result => [
    result.id,
    result.objectId
  ].filter(Boolean).map(String)));
  const attrs = visual.attributes || {};
  const candidates = [
    visual.resultId,
    visual.supportsResultId,
    visual.targetResultId,
    visual.objectId,
    visual.supportsObjectId,
    visual.targetObjectId,
    attrs.resultId,
    attrs.supportsResultId,
    attrs.targetResultId,
    attrs.objectId,
    attrs.supportsObjectId,
    attrs.targetObjectId
  ].filter(Boolean).map(String);

  return candidates.find(candidate => ids.has(candidate)) || null;
}

function explicitAnchorIdForAttachment(item, anchors) {
  const ids = new Set(anchors.flatMap(anchor => [
    anchor.id,
    anchor.objectId
  ].filter(Boolean).map(String)));
  const attrs = item.attributes || {};
  const candidates = [
    item.anchorId,
    item.spatialAnchorId,
    item.targetAnchorId,
    item.regionId,
    item.locationId,
    item.objectId,
    item.targetObjectId,
    attrs.anchorId,
    attrs.spatialAnchorId,
    attrs.targetAnchorId,
    attrs.regionId,
    attrs.locationId,
    attrs.objectId,
    attrs.targetObjectId
  ].filter(Boolean).map(String);

  return candidates.find(candidate => ids.has(candidate)) || null;
}

function attributesOf(object = {}) {
  return {
    ...(object.attributes || {}),
    ...object
  };
}

function readDisplayHint(object = {}) {
  const attrs = object.attributes || {};
  const display = object.display || attrs.display || object.visualization || attrs.visualization || {};
  const primitive = firstString([
    object.displayPrimitive,
    attrs.displayPrimitive,
    display.displayPrimitive,
    display.primitive,
    object.displayIntent,
    attrs.displayIntent
  ]);
  return {
    primitive: normalizeDisplayPrimitive(primitive),
    mode: firstString([display.mode, object.displayMode, attrs.displayMode])
  };
}

function hasRasterSignal(attrs = {}) {
  const format = firstString([
    attrs.format,
    attrs.dataFormat,
    attrs.mediaType,
    attrs.storageFormat,
    attrs.gridType
  ]).toLowerCase();
  return ['geotiff', 'netcdf', 'zarr', 'raster', 'gridded'].includes(format)
    || Boolean(attrs.grid || attrs.raster || attrs.rasterLayer);
}

function firstString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function getLayer(type) {
  return ontology.getEntityLayer(type) || 'unknown';
}

function getCategory(type) {
  return ontology.ENTITY_SCHEMAS?.[type]?.category || 'other';
}

function normalizeBbox(value) {
  if (!Array.isArray(value) || value.length < 4) return null;
  const bbox = value.slice(0, 4).map(Number);
  return bbox.every(Number.isFinite) ? bbox : null;
}

function normalizePoint(value) {
  const coordinates = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray(value.coordinates)
      ? value.coordinates
      : null;
  if (!coordinates || coordinates.length < 2) return null;
  const point = coordinates.slice(0, 2).map(Number);
  return point.every(Number.isFinite) ? point : null;
}

function titleForObject(object = {}, fallback) {
  const attrs = object.attributes || {};
  return stringifyFirst([object.name, object.title, object.label, attrs.name, attrs.title, attrs.label]) || fallback;
}

function stringifyFirst(values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      const filtered = value.filter(Boolean);
      if (filtered.length > 0) return filtered.map(item => stringifyValue(item)).join(', ');
      continue;
    }
    return stringifyValue(value);
  }
  return '';
}

function stringifyValue(value) {
  if (typeof value === 'object' && value !== null) {
    return value.name || value.label || value.title || value.value || JSON.stringify(value);
  }
  return String(value);
}

function stableId(prefix, ...parts) {
  const key = parts
    .filter(value => value !== undefined && value !== null && value !== '')
    .map(value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('-')
    .slice(0, 80);
  return `${prefix}-${key || 'item'}`;
}

function anchorKey(anchor) {
  return `${anchor.sourceId}:${anchor.objectId || anchor.label}:${anchor.displayPrimitive}:${JSON.stringify(anchor.spatial || {})}`;
}

function resultKey(result) {
  return `${result.sourceId}:${result.objectId || result.label}:${result.variable || ''}:${result.value || ''}`;
}

function attachmentKey(attachment) {
  return `${attachment.sourceId}:${attachment.kind}:${attachment.label}:${attachment.evidence?.imageUrl || attachment.evidence?.url || ''}`;
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function layerLabel(primitive) {
  return labelForDisplayPrimitive(primitive);
}

module.exports = {
  buildMapRecomposition
};
