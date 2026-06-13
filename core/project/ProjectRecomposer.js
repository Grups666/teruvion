/**
 * ProjectRecomposer
 *
 * Builds a project-level, source-grounded view from one or more decomposition
 * results. This is a pure aggregation layer: it does not infer new evidence,
 * call LLMs, or execute remote code.
 */

const { assessProjectRecompositionQuality } = require('../quality/SourceObjectGraphQuality');

function buildProjectRecomposition(input = {}) {
  const sources = normalizeSources(input);
  const sourceSummaries = sources.map((source, index) => summarizeSource(source, index));
  const resources = mergeResources(sources);
  const visuals = mergeVisualEvidence(sources);
  const route = mergeResearchRoute(sources);
  const integrity = summarizeIntegrity(sourceSummaries);

  const recomposition = {
    schemaVersion: 'project-recomposition-v1',
    generatedAt: new Date().toISOString(),
    sourceCount: sourceSummaries.length,
    sources: sourceSummaries,
    aggregate: {
      brief: mergeBrief(sourceSummaries),
      objectCounts: sourceSummaries.reduce((counts, source) => {
        counts.source += source.objectCounts.source;
        counts.capability += source.objectCounts.capability;
        counts.world += source.objectCounts.world;
        counts.evidence += source.objectCounts.evidence;
        counts.relations += source.objectCounts.relations;
        return counts;
      }, { source: 0, capability: 0, world: 0, evidence: 0, relations: 0 }),
      route,
      visualEvidence: {
        count: visuals.length,
        explainedCount: visuals.filter(item => item.interpretation || item.howProduced || item.supportedClaim).length,
        items: visuals.slice(0, 12)
      },
      resources: {
        count: resources.length,
        reusableCount: resources.filter(resource => isReusableResource(resource)).length,
        linkedCount: resources.filter(resource => resource.linked).length,
        items: resources.slice(0, 12)
      },
      limitations: mergeLimitations(sources).slice(0, 12),
      integrity
    }
  };

  recomposition.aggregate.productQuality = assessProjectRecompositionQuality(recomposition);
  return recomposition;
}

function normalizeSources(input = {}) {
  const decompositions = Array.isArray(input.decompositions)
    ? input.decompositions
    : input.decomposition
      ? [input.decomposition]
      : [];
  const coverages = Array.isArray(input.sourceCoverages)
    ? input.sourceCoverages
    : input.sourceCoverage
      ? [input.sourceCoverage]
      : [];
  const admissions = Array.isArray(input.admissions)
    ? input.admissions
    : input.admission
      ? [input.admission]
      : [];

  return decompositions
    .filter(Boolean)
    .map((decomposition, index) => ({
      decomposition,
      sourceCoverage: coverages[index] || coverages[0] || null,
      admission: admissions[index] || admissions[0] || null
    }));
}

function summarizeSource(source, index) {
  const decomposition = source.decomposition || {};
  const sourceObject = decomposition.sourceObject || {};
  const attributes = sourceObject.attributes || {};
  const brief = decomposition.researchBrief || {};
  const integrity = decomposition.extractionIntegrity || {};
  const title = brief.title
    || attributes.title
    || sourceObject.name
    || sourceObject.title
    || `Source ${index + 1}`;

  return {
    id: sourceObject.id || `source-${index + 1}`,
    type: sourceObject.type || decomposition.sourceType || source.admission?.sourceType || 'Source',
    title,
    url: brief.url || attributes.url || attributes.identifier || decomposition.input || null,
    brief: {
      oneLine: brief.oneLine || attributes.abstract || attributes.description || '',
      keyPointCount: Array.isArray(brief.keyPoints) ? brief.keyPoints.length : 0,
      keyPoints: normalizeBriefPoints(brief.keyPoints).slice(0, 8)
    },
    extraction: {
      method: decomposition.provenance?.extractionMethod || 'unknown',
      confidence: typeof decomposition.confidence === 'number' ? decomposition.confidence : null,
      depth: source.admission?.depth || decomposition.depth || null
    },
    objectCounts: {
      source: sourceObject.id ? 1 : 0,
      capability: (decomposition.capabilityObjects || []).length,
      world: (decomposition.worldObjects || []).length,
      evidence: (decomposition.evidenceObjects || []).length,
      relations: (decomposition.bridgeRelations || []).length
    },
    coverage: source.sourceCoverage ? {
      level: source.sourceCoverage.contentLevel || null,
      label: source.sourceCoverage.label || null,
      detail: source.sourceCoverage.detail || null
    } : null,
    route: {
      nodeCount: decomposition.workflowOutline?.nodes?.length || 0,
      edgeCount: decomposition.workflowOutline?.edges?.length || 0,
      quality: integrity.routeQuality?.level || decomposition.workflowOutline?.provenance?.routeQuality?.level || null,
      groundingScore: integrity.routeQuality?.groundingScore ?? null,
      traceability: integrity.graphTraceability?.level || null
    },
    visualEvidence: {
      count: (decomposition.visualEvidence || []).length,
      quality: integrity.visualEvidenceQuality?.level || null
    },
    resources: {
      count: (decomposition.externalResources || []).length,
      quality: integrity.resourceGraphQuality?.level || null
    },
    integrity: {
      status: integrity.status || 'unknown',
      warningCount: (integrity.issues || []).filter(issue => issue?.severity === 'warning').length,
      issueCount: (integrity.issues || []).length
    }
  };
}

function mergeBrief(sourceSummaries) {
  const keyPoints = [];
  const seen = new Set();
  for (const source of sourceSummaries) {
    for (const point of source.brief.keyPoints || []) {
      const key = normalizeKey(`${point.label}:${point.value}`);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keyPoints.push({
        ...point,
        sourceId: source.id,
        sourceTitle: source.title
      });
    }
  }

  const primary = sourceSummaries.find(source => source.brief.oneLine) || sourceSummaries[0] || null;
  return {
    title: primary?.title || 'Project',
    oneLine: primary?.brief.oneLine || '',
    keyPointCount: keyPoints.length,
    keyPoints: keyPoints.slice(0, 12)
  };
}

function normalizeBriefPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .filter(point => point && (point.value || point.detail || point.label))
    .map((point, index) => ({
      id: point.id || `brief-${index + 1}`,
      label: point.label || 'Point',
      value: point.value || point.detail || point.label,
      detail: point.detail || point.value || '',
      provenance: point.provenance || null
    }));
}

function mergeResearchRoute(sources) {
  const nodes = [];
  const edges = [];
  const seenNodeKeys = new Set();
  const seenEdgeKeys = new Set();

  for (const [sourceIndex, source] of sources.entries()) {
    const decomposition = source.decomposition || {};
    for (const node of decomposition.workflowOutline?.nodes || []) {
      if (!node?.id || !node.label) continue;
      const key = normalizeKey(`${node.stage}:${node.label}`);
      if (seenNodeKeys.has(key)) continue;
      seenNodeKeys.add(key);
      nodes.push({
        id: `${sourceIndex + 1}:${node.id}`,
        sourceId: decomposition.sourceObject?.id || `source-${sourceIndex + 1}`,
        label: node.label,
        stage: node.stage || null,
        summary: node.summary || '',
        provenance: node.provenance || null,
        support: node.support || null
      });
    }

    for (const edge of decomposition.workflowOutline?.edges || []) {
      if (!edge?.from || !edge?.to) continue;
      const key = `${sourceIndex}:${edge.from}:${edge.to}:${edge.label || ''}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      edges.push({
        from: `${sourceIndex + 1}:${edge.from}`,
        to: `${sourceIndex + 1}:${edge.to}`,
        label: edge.label || 'relates',
        sourceId: decomposition.sourceObject?.id || `source-${sourceIndex + 1}`
      });
    }
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    stages: Array.from(new Set(nodes.map(node => node.stage).filter(Boolean))),
    nodes: nodes.slice(0, 24),
    edges: edges.slice(0, 32)
  };
}

function mergeVisualEvidence(sources) {
  const items = [];
  const seen = new Set();
  for (const [sourceIndex, source] of sources.entries()) {
    const decomposition = source.decomposition || {};
    for (const visual of decomposition.visualEvidence || []) {
      const key = normalizeKey(`${visual.label}:${visual.caption}:${visual.imageUrl || ''}`);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: visual.id || `visual-${items.length + 1}`,
        sourceId: decomposition.sourceObject?.id || `source-${sourceIndex + 1}`,
        label: visual.label || visual.title || 'Visual evidence',
        kind: visual.kind || 'figure',
        caption: visual.caption || '',
        imageUrl: visual.imageUrl || null,
        sourceUrl: visual.sourceUrl || null,
        routeRole: visual.routeRole || '',
        supports: visual.supports || '',
        readHint: visual.readHint || '',
        interpretation: visual.interpretation || '',
        howProduced: visual.howProduced || '',
        supportedClaim: visual.supportedClaim || '',
        provenance: visual.provenance || null
      });
    }
  }
  return items;
}

function mergeResources(sources) {
  const items = [];
  const seen = new Set();
  for (const [sourceIndex, source] of sources.entries()) {
    const decomposition = source.decomposition || {};
    const linkedUrls = new Set((decomposition.resourceGraph?.edges || [])
      .map(edge => edge.from)
      .filter(id => typeof id === 'string' && id.startsWith('resource-')));

    for (const resource of decomposition.externalResources || []) {
      const key = normalizeKey(resource.url || resource.label || resource.type || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const graphId = `resource-${slugify(resource.url || resource.label || resource.type || 'resource')}`;
      items.push({
        id: graphId,
        sourceId: decomposition.sourceObject?.id || `source-${sourceIndex + 1}`,
        label: resource.label || resource.url || 'Resource',
        url: resource.url || null,
        type: resource.type || 'external',
        role: resource.role || '',
        source: resource.source || '',
        context: resource.context || '',
        investigationLabel: resource.investigationLabel || '',
        routeRelevance: resource.routeRelevance || '',
        verificationFocus: resource.verificationFocus || '',
        reviewHint: resource.reviewHint || '',
        reproducibilityGrade: resource.reproducibilityGrade || resource.enrichment?.grade || null,
        linked: linkedUrls.has(graphId)
      });
    }
  }
  return items;
}

function mergeLimitations(sources) {
  const items = [];
  const seen = new Set();
  for (const [sourceIndex, source] of sources.entries()) {
    const decomposition = source.decomposition || {};
    const sourceId = decomposition.sourceObject?.id || `source-${sourceIndex + 1}`;
    const insightItems = [
      ...(decomposition.llmInsights?.researchGaps || []).map(item => ({ ...item, kind: 'research_gap' })),
      ...(decomposition.llmInsights?.limitations || []).map(item => ({ ...item, kind: 'limitation' })),
      ...(decomposition.inferredLimitations || []).map(item => ({ ...item, kind: item.kind || 'limitation' }))
    ];

    for (const item of insightItems) {
      const label = item.label || item.value || item.title || item.id || '';
      const detail = item.detail || item.description || item.summary || item.reason || '';
      const key = normalizeKey(`${item.kind}:${label}:${detail}`);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: item.id || `${item.kind || 'limitation'}-${items.length + 1}`,
        kind: item.kind || 'limitation',
        label,
        detail,
        severity: item.severity || (item.kind === 'research_gap' ? 'info' : 'warning'),
        source: item.source || null,
        sourceId,
        provenance: item.provenance || null
      });
    }
  }
  return items;
}

function summarizeIntegrity(sourceSummaries) {
  const warningCount = sourceSummaries.reduce((total, source) => total + source.integrity.warningCount, 0);
  const issueCount = sourceSummaries.reduce((total, source) => total + source.integrity.issueCount, 0);
  const weakSources = sourceSummaries
    .filter(source => source.integrity.warningCount > 0 || ['weak', 'missing', 'limited'].includes(source.route.quality))
    .map(source => source.id);

  return {
    status: warningCount > 0 ? 'needs_review' : 'ready',
    warningCount,
    issueCount,
    weakSourceIds: weakSources
  };
}

function isReusableResource(resource = {}) {
  return ['repository', 'code', 'software', 'dataset', 'data', 'supplement', 'model', 'documentation']
    .includes(String(resource.type || '').toLowerCase());
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function slugify(value) {
  return String(value || 'resource')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 48) || 'resource';
}

module.exports = {
  buildProjectRecomposition
};
