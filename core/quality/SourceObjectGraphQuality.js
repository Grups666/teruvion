/**
 * SourceObjectGraphQuality
 *
 * Product-level quality gate for source-to-object-graph decomposition.
 * It evaluates durable contracts, not domain terms or publisher-specific
 * patterns: brief, route, provenance, evidence, resources, and recomposition.
 */

function assessSourceObjectGraphQuality(decomposition = {}, options = {}) {
  const integrity = decomposition.extractionIntegrity || {};
  const sourceCoverage = options.sourceCoverage || {};
  const components = {
    brief: scoreBrief(decomposition, integrity),
    route: scoreRoute(decomposition, integrity),
    traceability: scoreTraceability(integrity),
    fidelity: scoreFidelity(integrity),
    visualEvidence: scoreVisualEvidence(decomposition, integrity),
    resources: scoreResources(decomposition, integrity),
    coverage: scoreCoverage(sourceCoverage)
  };
  const weights = {
    brief: 0.18,
    route: 0.22,
    traceability: 0.17,
    fidelity: 0.2,
    visualEvidence: 0.08,
    resources: 0.08,
    coverage: 0.07
  };
  const score = Math.round(Object.entries(components)
    .reduce((total, [key, component]) => total + component.score * weights[key], 0));
  const blockingReasons = Object.values(components)
    .flatMap(component => component.reasons.map(reason => `${component.label}: ${reason}`));
  const weakComponents = Object.entries(components)
    .filter(([, component]) => ['weak', 'missing', 'limited'].includes(component.level))
    .map(([key]) => key);

  return {
    schemaVersion: 'source-object-graph-quality-v1',
    level: score >= 82 && weakComponents.length === 0
      ? 'product_ready'
      : score >= 68 && weakComponents.length <= 1
        ? 'reviewable'
        : 'weak',
    score,
    components,
    weakComponents,
    reasons: blockingReasons.slice(0, 8)
  };
}

function assessProjectRecompositionQuality(recomposition = {}) {
  const aggregate = recomposition.aggregate || {};
  const route = aggregate.route || {};
  const brief = aggregate.brief || {};
  const visuals = aggregate.visualEvidence || {};
  const resources = aggregate.resources || {};
  const integrity = aggregate.integrity || {};

  const components = {
    brief: {
      label: 'Project brief',
      level: (brief.keyPointCount || 0) >= 3 && brief.oneLine ? 'complete' : (brief.oneLine || brief.keyPointCount > 0) ? 'partial' : 'missing',
      score: (brief.keyPointCount || 0) >= 3 && brief.oneLine ? 100 : (brief.oneLine || brief.keyPointCount > 0) ? 65 : 20,
      reasons: (brief.keyPointCount || 0) >= 3 ? [] : ['needs more source-level key points']
    },
    route: {
      label: 'Project route',
      level: (route.nodeCount || 0) >= 3 && (route.edgeCount || 0) >= 2 ? 'complete' : (route.nodeCount || 0) >= 2 ? 'partial' : 'weak',
      score: (route.nodeCount || 0) >= 3 && (route.edgeCount || 0) >= 2 ? 100 : (route.nodeCount || 0) >= 2 ? 70 : 35,
      reasons: (route.nodeCount || 0) >= 3 ? [] : ['needs more route nodes from source material']
    },
    visuals: {
      label: 'Project visual evidence',
      level: (visuals.count || 0) === 0 ? 'not_applicable' : (visuals.explainedCount || 0) >= (visuals.count || 0) ? 'complete' : 'partial',
      score: (visuals.count || 0) === 0 ? 75 : Math.round(((visuals.explainedCount || 0) / Math.max(1, visuals.count || 0)) * 100),
      reasons: (visuals.count || 0) > 0 && (visuals.explainedCount || 0) < (visuals.count || 0) ? ['some visuals are retained but not explained'] : []
    },
    resources: {
      label: 'Project resources',
      level: (resources.count || 0) === 0 ? 'missing' : (resources.linkedCount || 0) > 0 ? 'complete' : 'partial',
      score: (resources.count || 0) === 0 ? 35 : (resources.linkedCount || 0) > 0 ? 100 : 65,
      reasons: (resources.count || 0) === 0 ? ['no reusable or reviewable resource links'] : (resources.linkedCount || 0) === 0 ? ['resources are not linked to route or evidence'] : []
    },
    integrity: {
      label: 'Project integrity',
      level: integrity.status === 'ready' ? 'complete' : 'partial',
      score: integrity.status === 'ready' ? 100 : Math.max(45, 85 - (integrity.warningCount || 0) * 10),
      reasons: integrity.warningCount > 0 ? [`${integrity.warningCount} source warning(s) need review`] : []
    }
  };
  const score = Math.round(
    components.brief.score * 0.24
    + components.route.score * 0.32
    + components.visuals.score * 0.12
    + components.resources.score * 0.14
    + components.integrity.score * 0.18
  );

  return {
    schemaVersion: 'project-recomposition-quality-v1',
    level: score >= 82 ? 'product_ready' : score >= 68 ? 'reviewable' : 'weak',
    score,
    components,
    reasons: Object.values(components).flatMap(component => component.reasons).slice(0, 8)
  };
}

function scoreBrief(decomposition, integrity) {
  const quality = integrity.briefQuality || {};
  const pointCount = decomposition.researchBrief?.keyPoints?.length || quality.pointCount || 0;
  const hasOneLine = Boolean(decomposition.researchBrief?.oneLine);
  const score = quality.informationScore !== undefined
    ? Math.round((quality.informationScore + (quality.groundingScore || 0)) / 2)
    : hasOneLine && pointCount >= 3
      ? 90
      : hasOneLine || pointCount > 0
        ? 60
        : 20;
  return component('Source brief', quality.level || (score >= 80 ? 'complete' : score >= 55 ? 'partial' : 'weak'), score, [
    ...array(quality.reasons),
    ...(!hasOneLine ? ['missing one-line user-facing summary'] : []),
    ...(pointCount < 2 ? ['needs at least two informative key points'] : [])
  ]);
}

function scoreRoute(decomposition, integrity) {
  const quality = integrity.routeQuality || {};
  const nodes = decomposition.workflowOutline?.nodes?.length || quality.contentNodeCount || 0;
  const edges = decomposition.workflowOutline?.edges?.length || quality.edgeCount || 0;
  const score = quality.informationScore !== undefined
    ? quality.informationScore
    : nodes >= 3 && edges >= 2
      ? 90
      : nodes >= 2
        ? 65
        : 25;
  return component('Research route', quality.level || (score >= 80 ? 'content' : score >= 55 ? 'partial' : 'weak'), score, [
    ...array(quality.reasons),
    ...(nodes < 3 ? ['needs enough nodes to express input, method, and output/finding'] : []),
    ...(edges < 1 ? ['route nodes are not connected'] : [])
  ]);
}

function scoreTraceability(integrity) {
  const trace = integrity.graphTraceability || {};
  return component('Graph traceability', trace.level || 'unknown', trace.score ?? 45, array(trace.reasons));
}

function scoreFidelity(integrity) {
  const fidelity = integrity.contentFidelity || {};
  return component('Content fidelity', fidelity.level || 'unknown', fidelity.score ?? 45, [
    ...array(fidelity.reasons),
    ...(array(fidelity.missingFacets).length ? [`missing ${array(fidelity.missingFacets).join(', ')}`] : [])
  ]);
}

function scoreVisualEvidence(decomposition, integrity) {
  const visual = integrity.visualEvidenceQuality || {};
  const count = decomposition.visualEvidence?.length || visual.visualCount || 0;
  if (visual.level === 'not_applicable' || count === 0) {
    return component('Visual evidence', visual.level || 'not_applicable', 75, []);
  }
  const score = visual.explanationCoverage !== undefined
    ? visual.explanationCoverage
    : Math.round(((visual.explainedCount || 0) / Math.max(1, count)) * 100);
  return component('Visual evidence', visual.level || (score >= 80 ? 'complete' : score >= 45 ? 'partial' : 'weak'), score, array(visual.reasons));
}

function scoreResources(decomposition, integrity) {
  const resource = integrity.resourceGraphQuality || {};
  const count = decomposition.resourceGraph?.summary?.resourceCount || decomposition.externalResources?.length || resource.resourceCount || 0;
  if (count === 0) {
    return component('Resource graph', 'missing', 35, ['no reusable resource was extracted']);
  }
  const score = resource.linkCoverage !== undefined
    ? resource.linkCoverage
    : Math.round(((resource.linkedResourceCount || 0) / Math.max(1, count)) * 100);
  return component('Resource graph', resource.level || (score >= 80 ? 'complete' : score >= 45 ? 'partial' : 'weak'), score, array(resource.reasons));
}

function scoreCoverage(sourceCoverage) {
  const level = sourceCoverage.contentLevel;
  if (level === 'full_text') return component('Source coverage', 'complete', 100, []);
  if (level === 'structured') return component('Source coverage', 'partial', 75, []);
  if (level === 'abstract_only') return component('Source coverage', 'partial', 55, ['abstract-only coverage limits route fidelity']);
  return component('Source coverage', 'unknown', 50, []);
}

function component(label, level, score, reasons) {
  return {
    label,
    level,
    score: clampScore(score),
    reasons: array(reasons).filter(Boolean).slice(0, 4)
  };
}

function clampScore(value) {
  const number = Number.isFinite(value) ? Number(value) : 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  assessSourceObjectGraphQuality,
  assessProjectRecompositionQuality
};
