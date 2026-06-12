/**
 * ProjectDiagnostics
 *
 * Builds project-level quality diagnostics from durable pipeline signals.
 * This is intentionally protocol-based: source coverage, decomposition method,
 * object counts, evidence count, and relation count are hard signals; LLM output
 * may improve those signals upstream but is not required here.
 */

function buildProjectImportDiagnosis({
  status = 'completed',
  error = null,
  sourceCoverage = null,
  decomposition = null,
  stored = null
} = {}) {
  if (status === 'failed') {
    return [
      {
        key: 'pipeline',
        label: 'Pipeline',
        status: 'missing',
        value: 'Failed',
        detail: error || 'Import failed before a stable object graph was created.'
      }
    ];
  }

  if (!decomposition) {
    return [
      {
        key: 'pipeline',
        label: 'Pipeline',
        status: 'pending',
        value: 'Processing',
        detail: 'Source resolution and object extraction are still running.'
      }
    ];
  }

  const counts = getObjectCounts(decomposition);
  const relationCount = getRelationCount(decomposition, stored);
  const sourceSignal = getSourceSignal(sourceCoverage, decomposition);

  return [
    sourceSignal,
    {
      key: 'spatial',
      label: 'Spatial Anchor',
      status: counts.world > 0 ? 'ready' : 'missing',
      value: counts.world > 0 ? formatCount(counts.world, 'world object') : 'Missing',
      detail: counts.world > 0
        ? 'Map and world lenses can focus on extracted regions, events, or Earth objects.'
        : 'No region, bbox, event location, or Earth object was extracted yet; the map stays global until a spatial anchor exists.'
    },
    {
      key: 'capability',
      label: 'Methods & Data',
      status: counts.capability > 0 ? 'ready' : 'missing',
      value: counts.capability > 0 ? formatCount(counts.capability, 'capability object') : 'Missing',
      detail: counts.capability > 0
        ? 'Methods, datasets, workflows, or computing resources are available for inspection.'
        : 'No method, dataset, workflow, model, or repository capability was extracted from this source.'
    },
    {
      key: 'evidence',
      label: 'Evidence',
      status: counts.evidence > 0 ? 'ready' : 'limited',
      value: counts.evidence > 0 ? formatCount(counts.evidence, 'evidence object') : 'Sparse',
      detail: counts.evidence > 0
        ? 'Claims or evidence chains are available for review.'
        : 'The current object graph has little claim-level evidence; treat conclusions as provisional.'
    },
    {
      key: 'graph',
      label: 'Object Links',
      status: relationCount > 0 ? 'ready' : counts.total > 1 ? 'limited' : 'missing',
      value: relationCount > 0 ? formatCount(relationCount, 'relation') : 'Sparse',
      detail: relationCount > 0
        ? 'Objects are linked enough to support graph inspection and comparison.'
        : 'Objects are not connected enough yet; relation extraction or manual review is needed.'
    }
  ];
}

function getObjectCounts(decomposition) {
  const source = decomposition.sourceObject ? 1 : 0;
  const capability = Array.isArray(decomposition.capabilityObjects)
    ? decomposition.capabilityObjects.length
    : 0;
  const world = Array.isArray(decomposition.worldObjects)
    ? decomposition.worldObjects.length
    : 0;
  const evidence = Array.isArray(decomposition.evidenceObjects)
    ? decomposition.evidenceObjects.length
    : 0;

  return {
    source,
    capability,
    world,
    evidence,
    total: source + capability + world + evidence
  };
}

function getRelationCount(decomposition, stored) {
  if (stored && typeof stored.relations === 'number') {
    return stored.relations;
  }

  if (Array.isArray(decomposition.bridgeRelations)) {
    return decomposition.bridgeRelations.length;
  }

  return 0;
}

function getSourceSignal(sourceCoverage, decomposition) {
  const method = decomposition.provenance?.extractionMethod || 'metadata';
  const contentLevel = sourceCoverage?.contentLevel || 'unknown';
  const isMetadataOnly = method === 'metadata' || contentLevel === 'metadata_only';
  const usedFallback = method === 'source-text-fallback';
  const hasFullText = Boolean(sourceCoverage?.hasFullText);
  const hasStructuredSections = Boolean(sourceCoverage?.hasStructuredSections);

  if (isMetadataOnly) {
    return {
      key: 'source',
      label: 'Source',
      status: 'limited',
      value: 'Metadata only',
      detail: 'Only citation metadata was available, so Teruvion cannot infer regions, methods, or evidence with high confidence.'
    };
  }

  if (usedFallback) {
    return {
      key: 'source',
      label: 'Source',
      status: 'limited',
      value: 'Fallback',
      detail: 'The system used source text fallback; extracted objects should be reviewed before product use.'
    };
  }

  return {
    key: 'source',
    label: 'Source',
    status: hasFullText || hasStructuredSections ? 'ready' : 'limited',
    value: sourceCoverage?.label || normalizeMethod(method),
    detail: sourceCoverage?.detail || 'Source coverage is sufficient for object extraction.'
  };
}

function formatCount(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function normalizeMethod(value) {
  return String(value || 'unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

module.exports = {
  buildProjectImportDiagnosis
};
