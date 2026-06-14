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
  const diagnostics = buildDiagnostics({
    anchors,
    results,
    attachments,
    sources: mapSources
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
      confidence: readConfidence(object)
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
    attachments
  };
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
  const defaultAnchor = input.anchors[0] || null;

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
      anchorId: defaultAnchor?.id || null,
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
      anchorId: defaultAnchor?.id || null,
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
    'region-layer',
    'point-layer',
    'route-or-flow-layer',
    'raster-layer',
    'classified-area-layer'
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
      id: 'attached-results',
      displayPrimitive: 'attached-results',
      label: 'Attached Results',
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

function chooseAnchorPrimitive(spatial, category) {
  if (spatial.geometry) return primitiveFromGeometry(spatial.geometry);
  if (spatial.bbox) return 'region-layer';
  if (spatial.point) return 'point-layer';
  if (category === 'earth-variable' || category === 'model-output') return 'attached-result';
  return 'spatial-anchor';
}

function chooseResultPrimitive(object, spatial, category) {
  const attrs = attributesOf(object);
  const displayHint = readDisplayHint(object);
  if (displayHint.primitive) return displayHint.primitive;

  if (hasRasterSignal(attrs)) {
    return 'raster-layer';
  }
  if (attrs.classification || attrs.classes || attrs.riskMap) return 'classified-area-layer';
  if (spatial.geometry || spatial.bbox) return 'region-layer';
  if (spatial.point) return 'point-layer';
  if (readTemporalBinding(object)) return 'attached-time-series';
  if (readResultValue(object)) return 'attached-chart-or-value';
  return 'evidence-chain-view';
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
  if (layers.some(layer => layer.displayPrimitive === 'classified-area-layer')) return 'classified-map';
  if (layers.some(layer => layer.displayPrimitive === 'raster-layer')) return 'raster-map';
  if (layers.some(layer => layer.displayPrimitive === 'route-or-flow-layer')) return 'route-map';
  if (layers.some(layer => layer.displayPrimitive === 'region-layer')) return 'regional-map';
  if (layers.some(layer => layer.displayPrimitive === 'point-layer')) return 'point-map';
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
  if (['geojson', 'shapefile', 'gpkg', 'kml'].includes(normalizedFormat)) return 'region-layer';
  if (['geotiff', 'netcdf', 'zarr', 'raster'].includes(normalizedFormat)) return 'raster-layer';
  if (['csv', 'tsv', 'xlsx', 'table'].includes(normalizedFormat)) return 'attached-table';
  if (String(resource.type || '').toLowerCase() === 'repository') return 'workflow-resource';
  return 'evidence-resource';
}

function resourceRenderability(resource, primitive) {
  if (!resource?.url) return 'not-renderable';
  if (primitive === 'raster-layer' || primitive === 'region-layer' || primitive === 'attached-table') {
    return 'renderable-with-light-processing';
  }
  if (primitive === 'workflow-resource') return 'requires-code-execution';
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

function normalizeDisplayPrimitive(value) {
  const normalized = String(value || '').trim();
  const allowed = new Set([
    'region-layer',
    'point-layer',
    'raster-layer',
    'classified-area-layer',
    'route-or-flow-layer',
    'source-figure-overlay',
    'attached-table',
    'attached-chart-or-figure',
    'attached-time-series',
    'attached-chart-or-value',
    'evidence-chain-view',
    'workflow-resource',
    'evidence-resource'
  ]);
  return allowed.has(normalized) ? normalized : '';
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

function inferFormatFromUrl(url) {
  if (typeof url !== 'string') return '';
  const pathname = url.split('?')[0].toLowerCase();
  if (pathname.endsWith('.geojson')) return 'geojson';
  if (pathname.endsWith('.shp') || pathname.endsWith('.zip')) return 'shapefile';
  if (pathname.endsWith('.gpkg')) return 'gpkg';
  if (pathname.endsWith('.kml')) return 'kml';
  if (pathname.endsWith('.tif') || pathname.endsWith('.tiff')) return 'geotiff';
  if (pathname.endsWith('.nc')) return 'netcdf';
  if (pathname.endsWith('.csv')) return 'csv';
  if (pathname.endsWith('.tsv')) return 'tsv';
  if (pathname.endsWith('.xlsx')) return 'xlsx';
  return '';
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

function geometryKind(geometry) {
  if (!geometry || typeof geometry !== 'object') return 'none';
  if (geometry.type === 'Point') return 'point';
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') return 'region';
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') return 'line';
  return 'geometry';
}

function primitiveFromGeometry(geometry) {
  const kind = geometryKind(geometry);
  if (kind === 'point') return 'point-layer';
  if (kind === 'region') return 'region-layer';
  if (kind === 'line') return 'route-or-flow-layer';
  return 'region-layer';
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
  return `${anchor.objectId || anchor.label}:${anchor.displayPrimitive}:${JSON.stringify(anchor.spatial || {})}`;
}

function resultKey(result) {
  return `${result.objectId || result.label}:${result.variable || ''}:${result.value || ''}`;
}

function attachmentKey(attachment) {
  return `${attachment.kind}:${attachment.label}:${attachment.evidence?.imageUrl || attachment.evidence?.url || ''}`;
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
  const labels = {
    'region-layer': 'Regions',
    'point-layer': 'Points',
    'route-or-flow-layer': 'Routes And Flows',
    'raster-layer': 'Raster Surfaces',
    'classified-area-layer': 'Classified Areas',
    'attached-results': 'Attached Results'
  };
  return labels[primitive] || primitive;
}

module.exports = {
  buildMapRecomposition
};
