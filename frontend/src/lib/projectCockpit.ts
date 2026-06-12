import type { Entity, Project } from '../types/api';
import {
  getDisplayLayer,
  getProjectDiagnosis,
  getProjectQuality,
  getProjectReadiness,
  getProjectStats,
  getSourceCapsule
} from './projectView';
import { formatSignalText } from './entityView';

export type LensSummary = {
  name: string;
  value: string;
  detail: string;
  status: 'ready' | 'empty';
  targetId: string | null;
};

export type CockpitSignal = {
  key: string;
  label: string;
  value: string;
  detail: string;
  status: 'ready' | 'review' | 'blocked' | 'pending';
  targetId?: string | null;
  edges?: Array<{ to: string; label?: string }>;
};

export type CockpitFocusItem = {
  label: string;
  value: string;
  detail: string;
  children?: Array<{
    label: string;
    value: string;
    detail?: string;
  }>;
};

export type ProjectBriefItem = {
  key: string;
  label: string;
  value: string;
  detail: string;
  status: 'ready' | 'review' | 'blocked' | 'pending';
};

const LENS_SUMMARY_ADAPTERS: Record<string, (lens: any) => LensSummary> = {
  map: lens => {
    const featureCount = lens.features?.length || 0;
    const regionCount = lens.regions?.length || 0;
    const targetId = lens.regions?.[0]?.id || lens.features?.[0]?.id || null;
    return {
      name: 'Map',
      value: featureCount > 0 ? 'Spatial anchor' : 'Global view',
      detail: regionCount > 0 ? 'Study area is available for map inspection.' : 'No explicit study area was extracted yet.',
      status: featureCount > 0 ? 'ready' : 'empty',
      targetId
    };
  },
  workflow: lens => {
    const nodeCount = lens.metadata?.stats?.totalNodes || lens.graph?.nodes?.length || 0;
    const stageCount = lens.stages?.length || lens.metadata?.stats?.stageCount || 0;
    const targetId = lens.stages?.find((stage: any) => stage.entities?.length > 0)?.entities?.[0]?.id
      || lens.graph?.nodes?.[0]?.id
      || null;
    return {
      name: 'Workflow',
      value: nodeCount > 0 ? 'Workflow readable' : 'Workflow missing',
      detail: stageCount > 0 ? 'A procedural path can be inspected.' : 'No clear method or execution path was extracted.',
      status: nodeCount > 0 ? 'ready' : 'empty',
      targetId
    };
  },
  evidence: lens => {
    const claims = lens.summary?.totalClaims || 0;
    const chains = lens.metadata?.stats?.totalChains || lens.chains?.length || 0;
    const targetId = lens.chains?.[0]?.entityId || lens.graph?.nodes?.[0]?.id || null;
    return {
      name: 'Evidence',
      value: claims > 0 ? 'Evidence available' : 'Evidence sparse',
      detail: chains > 0 ? 'Claims can be traced back to source evidence.' : 'No inspectable evidence chain was extracted.',
      status: claims > 0 ? 'ready' : 'empty',
      targetId
    };
  },
  timeline: lens => {
    const events = lens.events?.length || lens.metadata?.stats?.totalEvents || 0;
    const targetId = lens.events?.[0]?.entityId || null;
    return {
      name: 'Timeline',
      value: events > 0 ? 'Timeline available' : 'No timeline',
      detail: lens.timeline?.span ? String(lens.timeline.span) : 'No temporal span',
      status: events > 0 ? 'ready' : 'empty',
      targetId
    };
  },
  comparison: lens => {
    const compared = lens.metadata?.stats?.comparedCount || lens.entities?.length || 0;
    const targetId = lens.entities?.[0]?.id || null;
    return {
      name: 'Comparison',
      value: compared >= 2 ? 'Comparable' : 'Needs another source',
      detail: compared >= 2 ? 'A comparison view can be opened.' : 'Load another related source before comparison.',
      status: compared >= 2 ? 'ready' : 'empty',
      targetId
    };
  }
};

export function getLensSummaries(lenses: Record<string, any> | null): LensSummary[] {
  if (!lenses) return [];

  return Object.keys(LENS_SUMMARY_ADAPTERS)
    .filter(name => Object.prototype.hasOwnProperty.call(lenses, name))
    .map(name => {
      const lens = lenses[name];
      if (lens.error) {
        return {
          name,
          value: 'Unavailable',
          detail: lens.error,
          status: 'empty' as const,
          targetId: null
        };
      }

      return LENS_SUMMARY_ADAPTERS[name](lens);
    });
}

export function getCockpitSignals(input: {
  project: Project;
  entities: Entity[];
  stats: ReturnType<typeof getProjectStats>;
  readiness: ReturnType<typeof getProjectReadiness> | null;
  diagnosis: ReturnType<typeof getProjectDiagnosis>;
  lenses: LensSummary[];
  sourceCapsule: ReturnType<typeof getSourceCapsule> | null;
}): CockpitSignal[] {
  const diagnosisByKey = new Map(input.diagnosis.map(item => [item.key, item]));
  const lensByName = new Map(input.lenses.map(lens => [lens.name.toLowerCase(), lens]));
  const firstEntityId = input.entities[0]?.id || null;
  const sourceId = input.entities.find(entity => getDisplayLayer(entity) === 'source')?.id || firstEntityId;
  const spatialLens = lensByName.get('map');
  const evidenceLens = lensByName.get('evidence');
  const sourceDiagnosis = diagnosisByKey.get('source') || diagnosisByKey.get('pipeline');
  const spatialDiagnosis = diagnosisByKey.get('spatial');
  const evidenceDiagnosis = diagnosisByKey.get('evidence');
  const capabilityDiagnosis = diagnosisByKey.get('capability');
  const isProcessing = input.project.analysis?.status === 'importing' || input.project.analysis?.status === 'analyzing';
  const workflowSignals = getWorkflowOutlineSignals(input.project);

  if (workflowSignals.length > 0) {
    return workflowSignals;
  }

  return [
    {
      key: 'source-material',
      label: 'Source Material',
      value: input.sourceCapsule?.title || input.project.name || 'Source resolved',
      detail: input.sourceCapsule?.brief || sourceDiagnosis?.detail || 'The original material is available, but its technical route has not been fully decomposed yet.',
      status: mapCockpitStatus(sourceDiagnosis?.status, input.readiness?.status, isProcessing),
      targetId: sourceId,
      edges: [{ to: 'route-gap', label: 'needs' }]
    },
    {
      key: 'route-gap',
      label: 'Route Gap',
      value: capabilityDiagnosis?.status === 'ready' ? 'Needs linking' : 'Need method-data extraction',
      detail: capabilityDiagnosis?.detail || 'A useful research graph should expose inputs, variables, methods, workflow steps, outputs, and findings. This import has not exposed enough of that route yet.',
      status: isProcessing ? 'pending' : 'review',
      targetId: input.entities.find(entity => getDisplayLayer(entity) === 'capability')?.id || firstEntityId,
      edges: [{ to: 'evidence-check', label: 'review' }]
    },
    {
      key: 'evidence-check',
      label: 'Evidence Check',
      value: evidenceLens?.value || evidenceDiagnosis?.value || 'Sparse',
      detail: evidenceLens?.detail || evidenceDiagnosis?.detail || 'Use this as a review cue, not as a replacement for a content-level workflow graph.',
      status: evidenceLens?.status === 'ready'
        ? 'ready'
        : mapCockpitStatus(evidenceDiagnosis?.status, input.readiness?.status, isProcessing),
      targetId: evidenceLens?.targetId || input.entities.find(entity => entity.category === 'evidence')?.id || null,
      edges: spatialLens?.status === 'ready' || spatialDiagnosis?.status === 'ready'
        ? [{ to: 'spatial-context', label: 'locates' }]
        : []
    },
    {
      key: 'spatial-context',
      label: 'Study Context',
      value: spatialLens?.value || spatialDiagnosis?.value || 'No study area',
      detail: spatialLens?.detail || spatialDiagnosis?.detail || 'Map remains global until an explicit region, hazard, event, or Earth-system scope is extracted.',
      status: spatialLens?.status === 'ready'
        ? 'ready'
        : mapCockpitStatus(spatialDiagnosis?.status, input.readiness?.status, isProcessing),
      targetId: spatialLens?.targetId || input.entities.find(entity => getDisplayLayer(entity) === 'world')?.id || null
    }
  ];
}

export function getCockpitFocusItems(input: {
  signal: CockpitSignal;
  project: Project;
  stats: ReturnType<typeof getProjectStats>;
  quality: ReturnType<typeof getProjectQuality> | null;
  readiness: ReturnType<typeof getProjectReadiness> | null;
  diagnosis: ReturnType<typeof getProjectDiagnosis>;
  lenses: LensSummary[];
  sourceCapsule: ReturnType<typeof getSourceCapsule> | null;
}): CockpitFocusItem[] {
  const diagnosisByKey = new Map(input.diagnosis.map(item => [item.key, item]));
  const lensByName = new Map(input.lenses.map(lens => [lens.name.toLowerCase(), lens]));
  const sourceDiagnosis = diagnosisByKey.get('source') || diagnosisByKey.get('pipeline');
  const spatialDiagnosis = diagnosisByKey.get('spatial');
  const evidenceDiagnosis = diagnosisByKey.get('evidence');
  const capabilityDiagnosis = diagnosisByKey.get('capability');
  const graphDiagnosis = diagnosisByKey.get('graph');
  const mapLens = lensByName.get('map');
  const evidenceLens = lensByName.get('evidence');
  const workflowLens = lensByName.get('workflow');
  const comparisonLens = lensByName.get('comparison');
  const workflowNode = getWorkflowOutlineNode(input.project, input.signal.key);

  if (workflowNode) {
    const children = workflowNode.children || [];
    if (children.length > 0) {
      return children.slice(0, 6).map((child: any) => ({
        label: child.label,
        value: child.value,
        detail: child.detail || workflowNode.summary || 'Source-backed detail from the selected route node.',
        children: child.children || []
      }));
    }

    return [
      {
        label: workflowNode.type || 'Route Node',
        value: workflowNode.label,
        detail: workflowNode.summary || 'This node is part of the extracted research route.'
      }
    ];
  }

  if (input.signal.key === 'source-material') {
    return [
      {
        label: 'Original',
        value: input.sourceCapsule?.source ? 'Linked' : 'Recorded',
        detail: input.sourceCapsule?.source
          ? 'The original source can be opened for review.'
          : 'The source was imported, but no public link is attached yet.'
      },
      {
        label: 'Brief',
        value: input.sourceCapsule?.title || input.project.name || 'Research source',
        detail: input.sourceCapsule?.brief || sourceDiagnosis?.detail || 'Teruvion is assembling a readable research route.'
      },
      {
        label: 'Evidence',
        value: input.quality?.coverage?.label || 'Review source',
        detail: input.quality?.coverage?.detail || 'Use the original source and extracted route before relying on this result.'
      },
      {
        label: 'Review State',
        value: input.sourceCapsule?.reviewState || 'Needs review',
        detail: 'This is a review cue, not a claim that the extracted interpretation is correct.'
      }
    ];
  }

  if (input.signal.key === 'route-gap') {
    return [
      {
        label: 'Missing Route',
        value: capabilityDiagnosis?.value || 'Needs extraction',
        detail: capabilityDiagnosis?.detail || 'The source has not exposed enough inputs, variables, methods, workflow steps, outputs, and findings.'
      },
      {
        label: 'What To Look For',
        value: 'Data -> Method -> Output',
        detail: 'A useful route should show what goes in, what transforms it, and what comes out.'
      },
      {
        label: 'Best Next Step',
        value: input.sourceCapsule?.source ? 'Review source' : 'Attach source',
        detail: input.sourceCapsule?.source
          ? 'Open the original source and inspect whether full text, code, data, or supplementary material is available.'
          : 'A source link is needed before the route can be checked deeply.'
      },
      {
        label: 'Current Risk',
        value: graphDiagnosis?.status ? formatSignalText(graphDiagnosis.status) : 'Limited route',
        detail: graphDiagnosis?.detail || 'Without content-level links, the graph should be treated as a diagnosis rather than a readable research route.'
      }
    ];
  }

  if (input.signal.key === 'spatial-context') {
    return [
      {
        label: 'Map State',
        value: mapLens?.value || 'Global view',
        detail: mapLens?.detail || 'No study area is available for the map yet.'
      },
      {
        label: 'Study Area',
        value: input.stats.world > 0 ? 'Detected' : 'Missing',
        detail: spatialDiagnosis?.detail || 'Spatial views need an explicit region, event location, or geographic scope.'
      },
      {
        label: 'Map State',
        value: input.stats.world > 0 ? 'Anchored' : 'Global',
        detail: input.stats.world > 0
          ? 'The map can focus on extracted spatial context.'
          : 'The map remains global because no verified spatial anchor exists.'
      }
    ];
  }

  if (input.signal.key === 'evidence-check') {
    return [
      {
        label: 'Claims',
        value: evidenceLens?.value || evidenceDiagnosis?.value || 'Sparse',
        detail: evidenceDiagnosis?.detail || 'Claim-level evidence is extracted only when source coverage supports it.'
      },
      {
        label: 'Traceability',
        value: evidenceLens?.detail || 'No evidence chain',
        detail: 'Evidence chains connect source statements to research details, links, and reviewable conclusions.'
      },
      {
        label: 'Review State',
        value: evidenceDiagnosis?.status ? formatSignalText(evidenceDiagnosis.status) : 'Review',
        detail: 'Evidence is a review signal; sparse evidence means conclusions should remain provisional.'
      }
    ];
  }

  return [
    {
      label: 'Workflow',
      value: workflowLens?.value || 'No workflow',
      detail: workflowLens?.detail || 'Workflow views need procedural structure or data-flow evidence.'
    },
    {
      label: 'Comparison',
      value: comparisonLens?.value || 'Unavailable',
      detail: comparisonLens?.detail || 'Comparison needs another comparable research source.'
    },
    {
      label: 'Readiness',
      value: input.readiness?.label || 'Unknown',
      detail: input.readiness?.nextStep || 'Readiness summarizes whether the project is useful, reviewable, or blocked.'
    }
  ];
}

export function getProjectBrief(input: {
  project: Project;
  quality: ReturnType<typeof getProjectQuality> | null;
  readiness: ReturnType<typeof getProjectReadiness> | null;
  diagnosis: ReturnType<typeof getProjectDiagnosis>;
  lenses: LensSummary[];
  sourceCapsule: ReturnType<typeof getSourceCapsule> | null;
}): ProjectBriefItem[] {
  const isProcessing = input.project.analysis?.status === 'importing' || input.project.analysis?.status === 'analyzing';
  const protocolBrief = input.project.metadata?.decomposition?.researchBrief;

  if (protocolBrief?.keyPoints?.length) {
    return protocolBrief.keyPoints.slice(0, 4).map((item, index) => ({
      key: item.id || `brief-${index + 1}`,
      label: item.label,
      value: item.value,
      detail: item.detail,
      status: isProcessing ? 'pending' : mapProtocolBriefStatus(item.value, protocolBrief.confidence)
    }));
  }

  const primaryGap = input.diagnosis.find(item => item.status === 'missing')
    || input.diagnosis.find(item => item.status === 'limited')
    || input.diagnosis.find(item => item.status === 'pending');
  const nextLens = input.lenses.find(lens => lens.status === 'ready' && lens.name === 'Evidence')
    || input.lenses.find(lens => lens.status === 'ready' && lens.name === 'Workflow')
    || input.lenses.find(lens => lens.status === 'ready' && lens.name === 'Map')
    || input.lenses.find(lens => lens.status === 'ready')
    || input.lenses[0];
  const confidenceValue = input.sourceCapsule?.confidence || 'Unknown';
  const sourceTitle = input.sourceCapsule?.title || input.project.name || 'Source is being resolved';

  return [
    {
      key: 'understanding',
      label: 'Understanding',
      value: input.readiness?.label || input.quality?.label || (isProcessing ? 'Processing' : 'Review'),
      detail: sourceTitle,
      status: isProcessing ? 'pending' : mapBriefStatus(input.readiness?.status, primaryGap?.status)
    },
    {
      key: 'gap',
      label: 'Main Gap',
      value: primaryGap?.label || 'No major gap',
      detail: primaryGap?.detail || 'The current extraction has enough structure for inspection.',
      status: primaryGap ? mapBriefStatus(input.readiness?.status, primaryGap.status) : 'ready'
    },
    {
      key: 'next',
      label: 'Explore Next',
      value: nextLens?.name || 'Inspect source',
      detail: nextLens?.detail || input.readiness?.nextStep || 'Open the source and review extracted evidence.',
      status: nextLens?.status === 'ready' ? 'ready' : isProcessing ? 'pending' : 'review'
    },
    {
      key: 'confidence',
      label: 'Confidence',
      value: confidenceValue,
      detail: input.quality?.method || 'Confidence appears after extraction.',
      status: confidenceValue === 'Unknown' ? 'review' : mapBriefStatus(input.readiness?.status, primaryGap?.status)
    }
  ];
}

function mapBriefStatus(
  readinessStatus?: string,
  diagnosisStatus?: string
): ProjectBriefItem['status'] {
  if (readinessStatus === 'processing' || diagnosisStatus === 'pending') return 'pending';
  if (readinessStatus === 'blocked' || diagnosisStatus === 'missing') return 'blocked';
  if (readinessStatus === 'ready' || diagnosisStatus === 'ready') return 'ready';
  return 'review';
}

function getWorkflowOutlineSignals(project: Project): CockpitSignal[] {
  const outline = project.metadata?.decomposition?.workflowOutline;
  const decomposition = project.metadata?.decomposition as any;
  const routeQuality = outline?.provenance?.routeQuality || decomposition?.extractionMetadata?.researchRoute;
  if (routeQuality?.quality === 'limited' || routeQuality?.level === 'limited') {
    return [];
  }
  const nodes = outline?.nodes || [];
  const nodeIds = new Set(nodes.map(node => node.id));
  const edgesBySource = new Map<string, Array<{ to: string; label?: string }>>();
  for (const edge of outline?.edges || []) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    const list = edgesBySource.get(edge.from) || [];
    list.push({ to: edge.to, label: edge.label });
    edgesBySource.set(edge.from, list);
  }
  const visibleNodes = nodes
    .filter(node => node.id !== 'source')
    .map(node => normalizeRouteNode(node, project))
    .filter(Boolean)
    .slice(0, 6);

  if (visibleNodes.length === 0) return [];

  return visibleNodes.map(node => ({
    key: node.id,
    label: node.displayType || node.type || 'Route',
    value: node.label,
    detail: node.summary || 'Extracted from available source material.',
    status: mapWorkflowNodeStatus(node.status),
    targetId: node.objectId || null,
    edges: (edgesBySource.get(node.id) || []).filter(edge => visibleNodes.some(target => target.id === edge.to))
  }));
}

function getWorkflowOutlineNode(project: Project, key: string) {
  const node = (project.metadata?.decomposition?.workflowOutline?.nodes || []).find(item => item.id === key) || null;
  return node ? normalizeRouteNode(node, project) : null;
}

function normalizeRouteNode(node: any, project: Project) {
  if (!node) return null;
  const stage = String(node.stage || '').toLowerCase();
  const objectType = String(node.objectType || node.type || '').toLowerCase();
  const rawLabel = String(node.label || '').trim();
  const rawSummary = String(node.summary || '').trim();
  const brief = project.metadata?.decomposition?.researchBrief;

  if (isInternalRouteValue(rawLabel)) {
    return null;
  }

  const displayType = getRouteDisplayType(stage, objectType, node.type);
  const label = rawLabel;
  const summary = cleanRouteSummary(rawSummary, stage, brief?.oneLine);
  const children = filterRouteChildren(node.children || [], stage);

  if (!label && !summary) return null;

  return {
    ...node,
    displayType,
    label: summarizeRouteText(label || displayType, 72),
    summary,
    children
  };
}

function getRouteDisplayType(stage: string, objectType: string, fallback?: string) {
  if (stage === 'data' || objectType.includes('dataset') || objectType.includes('variable')) return 'Data';
  if (stage === 'method' || objectType.includes('model') || objectType.includes('algorithm') || objectType.includes('method')) return 'Method';
  if (stage === 'execution' || objectType.includes('workflow')) return 'Workflow';
  if (stage === 'context' || objectType.includes('region') || objectType.includes('hazard') || objectType.includes('risk')) return 'Study Context';
  if (stage === 'evidence' || objectType.includes('claim') || objectType.includes('evidence')) return 'Finding';
  if (stage === 'resource') return 'Resource';
  return fallback || 'Route';
}

function cleanRouteSummary(summary: string, stage: string, brief?: string) {
  if (!summary || isInternalRouteValue(summary)) {
    if (stage === 'context') return 'Places, hazards, events, or Earth-system scope visible in the source.';
    if (stage === 'evidence') return 'Findings should stay provisional until their source evidence is checked.';
    if (stage === 'method') return 'Method, model, algorithm, or analysis step used by the source.';
    if (stage === 'data') return 'Inputs, variables, observations, or datasets used by the source.';
    return brief || 'Readable step from the source route.';
  }
  return summarizeRouteText(summary, 180);
}

function filterRouteChildren(children: any[], stage: string): any[] {
  return children
    .filter(child => child && !isInternalRouteLabel(child.label) && !isInternalRouteValue(child.value))
    .slice(0, 5)
    .map(child => ({
      ...child,
      label: formatRouteChildLabel(child.label, stage),
      value: summarizeRouteText(child.value, 120),
      detail: summarizeRouteText(child.detail || '', 160),
      children: (child.children || [])
        .filter((detail: any) => detail && !isInternalRouteLabel(detail.label) && !isInternalRouteValue(detail.value))
        .slice(0, 4)
        .map((detail: any) => ({
          ...detail,
          value: summarizeRouteText(detail.value, 110),
          detail: summarizeRouteText(detail.detail || '', 150)
        }))
    }));
}

function formatRouteChildLabel(label: string, stage: string) {
  const normalized = String(label || '').toLowerCase();
  if (normalized === 'description' || normalized === 'summary') return 'What it does';
  if (normalized === 'statement') return 'Claim';
  if (normalized === 'source text') return 'Source Evidence';
  if (normalized === 'name' || normalized === 'title') return getRouteDisplayType(stage, '', 'Detail');
  return label;
}

function isInternalRouteLabel(value: string) {
  const normalized = String(value || '').toLowerCase().trim();
  return ['object type', 'confidence', 'field', 'depth', 'extraction', 'review state'].includes(normalized);
}

function isInternalRouteValue(value: string) {
  const normalized = String(value || '').toLowerCase().trim();
  const internalPhrases = [
    'the research structure is linked',
    'no explicit study area',
    'claims can be traced',
    'a comparison view can be opened',
    'spatial or earth-system scope extracted',
    'finding-level support is provisional',
    'method node extracted',
    'data node extracted',
    'route node extracted',
    'source-backed detail',
    'review signal',
    'not a guarantee'
  ];
  return !normalized
    || ['paper', 'source', 'deep', 'hybrid extraction', 'metadata only', 'ready', 'connected', 'global view', 'workflow readable', 'evidence available'].includes(normalized)
    || internalPhrases.some(phrase => normalized.includes(phrase))
    || /^\d+%$/.test(normalized);
}

function summarizeRouteText(value: string, limit: number) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function mapWorkflowNodeStatus(status?: string): CockpitSignal['status'] {
  if (status === 'ready' || status === 'review' || status === 'blocked' || status === 'pending') return status;
  return 'review';
}

function mapProtocolBriefStatus(value: string, confidence?: number): ProjectBriefItem['status'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('missing') || normalized.includes('limited') || normalized.includes('sparse')) return 'review';
  if (typeof confidence === 'number' && confidence < 0.45) return 'review';
  return 'ready';
}

function mapCockpitStatus(
  diagnosisStatus?: string,
  readinessStatus?: string,
  isProcessing = false
): CockpitSignal['status'] {
  if (isProcessing || diagnosisStatus === 'pending' || readinessStatus === 'processing') return 'pending';
  if (diagnosisStatus === 'ready' || readinessStatus === 'ready') return 'ready';
  if (diagnosisStatus === 'missing' || readinessStatus === 'blocked') return 'blocked';
  return 'review';
}
