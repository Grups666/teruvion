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
};

export type CockpitFocusItem = {
  label: string;
  value: string;
  detail: string;
};

const LENS_SUMMARY_ADAPTERS: Record<string, (lens: any) => LensSummary> = {
  map: lens => {
    const featureCount = lens.features?.length || 0;
    const regionCount = lens.regions?.length || 0;
    const targetId = lens.regions?.[0]?.id || lens.features?.[0]?.id || null;
    return {
      name: 'Map',
      value: `${featureCount} feature${featureCount !== 1 ? 's' : ''}`,
      detail: regionCount > 0 ? `${regionCount} region${regionCount !== 1 ? 's' : ''}` : 'No spatial feature',
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
      value: `${nodeCount} node${nodeCount !== 1 ? 's' : ''}`,
      detail: stageCount > 0 ? `${stageCount} stage${stageCount !== 1 ? 's' : ''}` : 'No pipeline stage',
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
      value: `${claims} claim${claims !== 1 ? 's' : ''}`,
      detail: chains > 0 ? `${chains} chain${chains !== 1 ? 's' : ''}` : 'No evidence chain',
      status: claims > 0 ? 'ready' : 'empty',
      targetId
    };
  },
  timeline: lens => {
    const events = lens.events?.length || lens.metadata?.stats?.totalEvents || 0;
    const targetId = lens.events?.[0]?.entityId || null;
    return {
      name: 'Timeline',
      value: `${events} event${events !== 1 ? 's' : ''}`,
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
      value: `${compared} object${compared !== 1 ? 's' : ''}`,
      detail: compared >= 2 ? 'Comparable set' : 'Needs at least 2 objects',
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
  const workflowLens = lensByName.get('workflow');
  const comparisonLens = lensByName.get('comparison');
  const sourceDiagnosis = diagnosisByKey.get('source') || diagnosisByKey.get('pipeline');
  const spatialDiagnosis = diagnosisByKey.get('spatial');
  const evidenceDiagnosis = diagnosisByKey.get('evidence');
  const graphDiagnosis = diagnosisByKey.get('graph');
  const capabilityDiagnosis = diagnosisByKey.get('capability');
  const isProcessing = input.project.analysis?.status === 'importing' || input.project.analysis?.status === 'analyzing';

  return [
    {
      key: 'source',
      label: 'Source',
      value: input.sourceCapsule?.type || sourceDiagnosis?.value || 'Pending',
      detail: input.sourceCapsule?.title || sourceDiagnosis?.detail || 'Resolving source identity.',
      status: mapCockpitStatus(sourceDiagnosis?.status, input.readiness?.status, isProcessing),
      targetId: sourceId
    },
    {
      key: 'object-graph',
      label: 'Object Graph',
      value: `${input.entities.length} object${input.entities.length !== 1 ? 's' : ''}`,
      detail: graphDiagnosis?.detail || `${input.stats.capability} capability, ${input.stats.world} world signal${input.stats.world !== 1 ? 's' : ''}.`,
      status: input.entities.length > 1
        ? mapCockpitStatus(graphDiagnosis?.status, input.readiness?.status, isProcessing)
        : isProcessing ? 'pending' : 'review',
      targetId: firstEntityId
    },
    {
      key: 'spatial',
      label: 'Spatial',
      value: spatialLens?.value || spatialDiagnosis?.value || 'No feature',
      detail: spatialLens?.detail || spatialDiagnosis?.detail || 'Map remains global until spatial evidence is extracted.',
      status: spatialLens?.status === 'ready'
        ? 'ready'
        : mapCockpitStatus(spatialDiagnosis?.status, input.readiness?.status, isProcessing),
      targetId: spatialLens?.targetId || input.entities.find(entity => getDisplayLayer(entity) === 'world')?.id || null
    },
    {
      key: 'evidence',
      label: 'Evidence',
      value: evidenceLens?.value || evidenceDiagnosis?.value || 'Sparse',
      detail: evidenceLens?.detail || evidenceDiagnosis?.detail || 'Evidence chains show whether extracted objects are backed by inspectable claims.',
      status: evidenceLens?.status === 'ready'
        ? 'ready'
        : mapCockpitStatus(evidenceDiagnosis?.status, input.readiness?.status, isProcessing),
      targetId: evidenceLens?.targetId || input.entities.find(entity => entity.category === 'evidence')?.id || null
    },
    {
      key: 'reuse',
      label: 'Reuse',
      value: workflowLens?.value || comparisonLens?.value || capabilityDiagnosis?.value || 'Not ready',
      detail: comparisonLens?.status === 'ready'
        ? comparisonLens.detail
        : workflowLens?.detail || capabilityDiagnosis?.detail || 'Needs workflow, evidence, or comparable objects before reuse.',
      status: comparisonLens?.status === 'ready' || workflowLens?.status === 'ready'
        ? 'ready'
        : mapCockpitStatus(capabilityDiagnosis?.status, input.readiness?.status, isProcessing),
      targetId: workflowLens?.targetId || comparisonLens?.targetId || input.entities.find(entity => getDisplayLayer(entity) === 'capability')?.id || null
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

  if (input.signal.key === 'source') {
    return [
      {
        label: 'Identity',
        value: input.sourceCapsule?.type || input.project.metadata?.sourceType || 'Source',
        detail: sourceDiagnosis?.detail || 'Source identity is derived from connector and metadata protocols.'
      },
      {
        label: 'Depth',
        value: input.sourceCapsule?.depth || formatSignalText(input.project.metadata?.admission?.depth || 'Pending'),
        detail: 'Admission depth controls how far Teruvion should try to decompose the source.'
      },
      {
        label: 'Extraction',
        value: input.sourceCapsule?.extraction || input.quality?.method || 'Pending',
        detail: input.quality?.coverage?.detail || 'Extraction reports the available source evidence, not a fabricated capability.'
      },
      {
        label: 'Confidence',
        value: input.sourceCapsule?.confidence || 'Unknown',
        detail: 'Confidence is a review signal for this import, not a guarantee of correctness.'
      }
    ];
  }

  if (input.signal.key === 'object-graph') {
    return [
      {
        label: 'Sources',
        value: String(input.stats.source),
        detail: 'Source objects preserve where the graph came from.'
      },
      {
        label: 'Capabilities',
        value: String(input.stats.capability),
        detail: capabilityDiagnosis?.detail || 'Capabilities represent methods, datasets, workflows, code, or reusable resources.'
      },
      {
        label: 'World',
        value: String(input.stats.world),
        detail: spatialDiagnosis?.detail || 'World objects anchor the graph to regions, events, hazards, or Earth system entities.'
      },
      {
        label: 'Relations',
        value: String(input.quality?.relations || 0),
        detail: graphDiagnosis?.detail || 'Relations determine whether objects can support reasoning and comparison.'
      }
    ];
  }

  if (input.signal.key === 'spatial') {
    return [
      {
        label: 'Map Features',
        value: mapLens?.value || '0 features',
        detail: mapLens?.detail || 'No spatial features are available for the map lens yet.'
      },
      {
        label: 'World Objects',
        value: String(input.stats.world),
        detail: spatialDiagnosis?.detail || 'Spatial views need explicit world or region objects.'
      },
      {
        label: 'Map State',
        value: input.stats.world > 0 ? 'Anchored' : 'Global',
        detail: input.stats.world > 0
          ? 'The map can focus on extracted spatial objects.'
          : 'The map remains global because no verified spatial anchor exists.'
      }
    ];
  }

  if (input.signal.key === 'evidence') {
    return [
      {
        label: 'Claims',
        value: evidenceLens?.value || evidenceDiagnosis?.value || 'Sparse',
        detail: evidenceDiagnosis?.detail || 'Claim-level evidence is extracted only when source coverage supports it.'
      },
      {
        label: 'Chains',
        value: evidenceLens?.detail || 'No evidence chain',
        detail: 'Evidence chains connect source statements to objects, relations, and reviewable conclusions.'
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
      detail: workflowLens?.detail || 'Workflow views need procedural objects or data-flow structure.'
    },
    {
      label: 'Comparison',
      value: comparisonLens?.value || 'Unavailable',
      detail: comparisonLens?.detail || 'Comparison needs at least two comparable objects.'
    },
    {
      label: 'Readiness',
      value: input.readiness?.label || 'Unknown',
      detail: input.readiness?.nextStep || 'Readiness summarizes whether the project is useful, reviewable, or blocked.'
    }
  ];
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
