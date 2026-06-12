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
  if (status === 'cancelled') {
    return [
      {
        key: 'pipeline',
        label: 'Pipeline',
        status: 'missing',
        value: 'Cancelled',
        detail: error || 'Import was cancelled before a stable object graph was created.'
      }
    ];
  }

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

function buildProjectReadinessSummary(diagnosis = []) {
  const items = Array.isArray(diagnosis) ? diagnosis : [];
  const counts = items.reduce((summary, item) => {
    if (item?.status && summary[item.status] !== undefined) {
      summary[item.status]++;
    }
    return summary;
  }, {
    ready: 0,
    limited: 0,
    missing: 0,
    pending: 0
  });

  const total = items.length;
  const score = total > 0 ? Math.round((counts.ready / total) * 100) : 0;
  const blockers = items
    .filter(item => item.status === 'missing' || item.status === 'limited')
    .map(item => item.label)
    .slice(0, 3);
  const pipeline = items.find(item => item.key === 'pipeline');

  if (counts.pending > 0) {
    return {
      status: 'processing',
      label: 'Processing',
      score,
      counts,
      blockers: [],
      nextStep: pipeline?.detail || 'Wait for the import pipeline to finish.'
    };
  }

  if (pipeline?.status === 'missing') {
    return {
      status: 'blocked',
      label: 'Blocked',
      score,
      counts,
      blockers: [pipeline.label],
      nextStep: pipeline.detail || 'Fix the failed import before using this project.'
    };
  }

  if (counts.missing === 0 && counts.limited === 0 && total > 0) {
    return {
      status: 'ready',
      label: 'Ready for Use',
      score,
      counts,
      blockers: [],
      nextStep: 'Open objects, inspect evidence, or compare this project with another source.'
    };
  }

  return {
    status: 'review',
    label: 'Needs Review',
    score,
    counts,
    blockers,
    nextStep: blockers.length > 0
      ? `Review ${blockers.join(', ')} before relying on this project.`
      : 'Review limited diagnostic signals before relying on this project.'
  };
}

function buildProjectActionPlan(diagnosis = [], readiness = null) {
  const items = Array.isArray(diagnosis) ? diagnosis : [];
  const byKey = new Map(items.map(item => [item.key, item]));

  if (readiness?.status === 'processing' || byKey.get('pipeline')?.status === 'pending') {
    return [
      {
        id: 'wait-for-import',
        label: 'Wait for import completion',
        reason: byKey.get('pipeline')?.detail || 'The import pipeline is still running.',
        targetLayer: null,
        fallbackLayer: null,
        priority: 'normal'
      },
      {
        id: 'review-source-after-import',
        label: 'Review source coverage once extraction finishes',
        reason: 'Coverage determines whether Teruvion can extract evidence, regions, methods, and object links.',
        targetLayer: 'source',
        fallbackLayer: null,
        priority: 'normal'
      }
    ];
  }

  if (readiness?.status === 'blocked' || byKey.get('pipeline')?.status === 'missing') {
    const pipeline = byKey.get('pipeline');
    const wasCancelled = pipeline?.value === 'Cancelled';

    return [
      {
        id: wasCancelled ? 'restart-import' : 'fix-import-failure',
        label: wasCancelled ? 'Restart import' : 'Fix failed import',
        reason: pipeline?.detail || 'The pipeline failed before a stable graph was created.',
        targetLayer: 'source',
        fallbackLayer: null,
        priority: 'high'
      }
    ];
  }

  const actions = [];
  const source = byKey.get('source');
  const spatial = byKey.get('spatial');
  const capability = byKey.get('capability');
  const evidence = byKey.get('evidence');
  const graph = byKey.get('graph');

  if (source && source.status !== 'ready') {
    actions.push({
      id: 'verify-source-coverage',
      label: 'Verify source coverage',
      reason: source.detail,
      targetLayer: 'source',
      fallbackLayer: null,
      priority: source.status === 'missing' ? 'high' : 'normal'
    });
  }

  if (spatial?.status === 'missing') {
    actions.push({
      id: 'add-spatial-anchor',
      label: 'Add or verify spatial scope',
      reason: spatial.detail,
      targetLayer: 'world',
      fallbackLayer: 'source',
      priority: 'high'
    });
  }

  if (capability?.status === 'missing') {
    actions.push({
      id: 'attach-capability',
      label: 'Attach methods, data, or code',
      reason: capability.detail,
      targetLayer: 'capability',
      fallbackLayer: 'source',
      priority: 'high'
    });
  }

  if (evidence && evidence.status !== 'ready') {
    actions.push({
      id: 'inspect-evidence',
      label: 'Inspect evidence limitations',
      reason: evidence.detail,
      targetLayer: 'source',
      fallbackLayer: 'capability',
      priority: 'normal'
    });
  }

  if (graph && graph.status !== 'ready') {
    actions.push({
      id: 'review-object-links',
      label: 'Review missing object links',
      reason: graph.detail,
      targetLayer: 'source',
      fallbackLayer: 'capability',
      priority: graph.status === 'missing' ? 'high' : 'normal'
    });
  }

  actions.push({
    id: 'inspect-object-evidence',
    label: 'Open an object to inspect evidence',
    reason: 'Object-level inspection shows provenance, confidence, relations, and available actions.',
    targetLayer: 'foundation',
    fallbackLayer: 'source',
    priority: 'normal'
  });

  const seen = new Set();
  return actions
    .filter(action => {
      if (seen.has(action.id)) return false;
      seen.add(action.id);
      return true;
    })
    .slice(0, 4);
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
  buildProjectImportDiagnosis,
  buildProjectReadinessSummary,
  buildProjectActionPlan
};
