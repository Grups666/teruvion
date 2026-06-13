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
  const integritySignal = getIntegritySignal(decomposition);

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
    },
    integritySignal
  ].filter(Boolean);
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
        operation: 'wait',
        targetLayer: null,
        fallbackLayer: null,
        priority: 'normal'
      },
      {
        id: 'cancel-import',
        label: 'Cancel import',
        reason: 'Stop this import if it is stuck or no longer needed.',
        operation: 'cancel',
        targetLayer: null,
        fallbackLayer: null,
        priority: 'high'
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
        operation: wasCancelled ? 'reimport' : 'inspect',
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
  const integrity = byKey.get('integrity');

  if (source && source.status !== 'ready') {
    actions.push({
      id: 'verify-source-coverage',
      label: 'Verify source coverage',
      reason: source.detail,
      operation: 'inspect',
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
      operation: 'inspect',
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
      operation: 'inspect',
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
      operation: 'inspect',
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
      operation: 'inspect',
      targetLayer: 'source',
      fallbackLayer: 'capability',
      priority: graph.status === 'missing' ? 'high' : 'normal'
    });
  }

  if (integrity && integrity.status !== 'ready') {
    actions.push({
      id: 'review-extraction-integrity',
      label: 'Review extraction integrity',
      reason: integrity.detail,
      operation: 'inspect',
      targetLayer: 'foundation',
      fallbackLayer: 'source',
      priority: integrity.status === 'missing' ? 'high' : 'normal'
    });
  }

  actions.push({
    id: 'inspect-object-evidence',
    label: 'Open an object to inspect evidence',
    reason: 'Object-level inspection shows provenance, confidence, relations, and available actions.',
    operation: 'inspect',
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

function getIntegritySignal(decomposition = {}) {
  const integrity = decomposition.extractionIntegrity;
  if (!integrity) return null;

  const issues = Array.isArray(integrity.issues) ? integrity.issues : [];
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const infoCount = issues.filter(issue => issue.severity === 'info').length;
  const fidelity = integrity.contentFidelity;
  const brief = integrity.briefQuality;
  const traceability = integrity.graphTraceability;
  const visualEvidence = integrity.visualEvidenceQuality;
  const resourceGraph = integrity.resourceGraphQuality;
  const productReadiness = integrity.productReadiness;
  const fidelityIssue = issues.find(issue => issue.id === 'content-fidelity');
  const briefIssue = issues.find(issue => issue.id === 'brief-quality');
  const groundingIssue = issues.find(issue => issue.id === 'facet-grounding');
  const traceabilityIssue = issues.find(issue => issue.id === 'graph-traceability');
  const visualIssue = issues.find(issue => issue.id === 'visual-evidence');
  const resourceIssue = issues.find(issue => issue.id === 'resource-graph-quality');
  const productIssue = issues.find(issue => issue.id === 'product-readiness');
  const issueSummary = issues
    .map(issue => issue.detail)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');

  if (integrity.status === 'ready' && warningCount === 0) {
    return {
      key: 'integrity',
      label: 'Extraction Integrity',
      status: 'ready',
      value: 'Checked',
      detail: infoCount > 0
        ? `Extraction integrity passed with ${infoCount} informational note(s).`
        : `Route quality, graph traceability${traceability?.score !== undefined ? ` (${traceability.score}%)` : ''}, content fidelity${fidelity?.score !== undefined ? ` (${fidelity.score}%)` : ''}, product readiness${productReadiness?.score !== undefined ? ` (${productReadiness.score}%)` : ''}, relation vocabulary, scope filtering, and evidence links passed protocol checks.`
    };
  }

  const fidelityDetail = fidelityIssue && fidelity
    ? `Content fidelity ${fidelity.score}%${fidelity.missingFacets?.length ? `; missing ${fidelity.missingFacets.join(', ')}` : ''}.`
    : '';
  const briefDetail = briefIssue && brief
    ? `Source brief ${brief.level}; ${brief.informativePointCount || 0}/${brief.pointCount || 0} point(s) informative and ${brief.groundedPointCount || 0}/${brief.pointCount || 0} grounded.`
    : '';
  const groundingDetail = groundingIssue && fidelity?.grounding
    ? formatGroundingDetail(fidelity.grounding)
    : '';
  const traceabilityDetail = traceabilityIssue && traceability
    ? `Graph traceability ${traceability.score}%${traceability.untracedNodeCount ? `; ${traceability.untracedNodeCount} untraced route node(s)` : traceability.weakNodeCount ? `; ${traceability.weakNodeCount} weakly traced route node(s)` : ''}.`
    : '';
  const visualDetail = visualIssue && visualEvidence
    ? `Visual evidence ${visualEvidence.level}; ${visualEvidence.explainedCount || 0}/${visualEvidence.visualCount || 0} figure/table item(s) explained.`
    : '';
  const resourceDetail = resourceIssue && resourceGraph
    ? `Resource graph ${resourceGraph.level}; ${resourceGraph.linkedResourceCount || 0}/${resourceGraph.resourceCount || 0} resource(s) linked.`
    : '';
  const productDetail = productIssue && productReadiness
    ? `Product readiness ${productReadiness.score}% (${productReadiness.level}); weak components: ${(productReadiness.weakComponents || []).join(', ') || 'review required'}.`
    : '';

  return {
    key: 'integrity',
    label: 'Extraction Integrity',
    status: warningCount > 0 ? 'limited' : 'ready',
    value: warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : 'Checked',
    detail: [productDetail, traceabilityDetail, fidelityDetail, groundingDetail, briefDetail, visualDetail, resourceDetail, issueSummary || 'Review extraction integrity before relying on this project.']
      .filter(Boolean)
      .join(' ')
  };
}

function formatGroundingDetail(grounding) {
  const ungrounded = Array.isArray(grounding.ungroundedFacets) ? grounding.ungroundedFacets : [];
  const weak = Array.isArray(grounding.weaklyGroundedFacets) ? grounding.weaklyGroundedFacets : [];
  if (ungrounded.length > 0) return `Ungrounded facets: ${ungrounded.join(', ')}.`;
  if (weak.length > 0) return `Weakly grounded facets: ${weak.join(', ')}.`;
  return '';
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
