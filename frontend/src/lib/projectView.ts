import type {
  Decomposition,
  Entity,
  EntityLayer,
  Project,
  ProjectActionItem,
  ProjectDiagnosisItem,
  ProjectDiagnosisStatus,
  ProjectReadinessSummary
} from '../types/api';
import { getEntityLayer } from '../types/api';
import { formatSignalText } from './entityView';

export type DisplayLayer = 'source' | 'capability' | 'world' | 'foundation';
export type ProjectQualityLevel = 'excellent' | 'useful' | 'partial' | 'limited' | 'pending';
export type ProjectQualityNoteLevel = 'info' | 'warning';

export interface ProjectStats {
  source: number;
  capability: number;
  world: number;
  foundation: number;
}

export interface ProjectQualityNote {
  text: string;
  level: ProjectQualityNoteLevel;
}

export interface ProjectCoverageSummary {
  label: string;
  detail: string;
  source?: string | null;
  metrics: Array<{ label: string; value: string }>;
  warning?: string | null;
}

export interface ProjectQuality {
  level: ProjectQualityLevel;
  label: string;
  method: string;
  relations: number;
  summary: string;
  coverage?: ProjectCoverageSummary | null;
  notes: ProjectQualityNote[];
}

export interface ProjectProgressStep {
  key: string;
  label: string;
  status: 'done' | 'active' | 'pending' | 'failed';
  detail: string;
}

export interface SourceCapsule {
  title: string;
  type: string;
  source: string | null;
  depth: string;
  extraction: string;
  confidence: string;
}

export interface ObjectConstellationNode {
  id: string;
  label: string;
  type: string;
  layer: DisplayLayer;
  count: number;
  sampleEntityId: string | null;
}

export type ProjectNextAction = ProjectActionItem & {
  targetLayer: DisplayLayer | null;
  fallbackLayer?: DisplayLayer | null;
};

type DecompositionView = Decomposition & {
  confidence?: number;
  provenance?: { extractionMethod?: string };
  extractionMetadata?: {
    llmExtraction?: { success?: boolean };
    textFallbackExtraction?: {
      capabilityCount?: number;
      worldCount?: number;
      evidenceCount?: number;
      relationCount?: number;
    };
  };
};

type SourceCoverageView = {
  contentLevel?: string;
  label?: string;
  detail?: string;
  source?: string | null;
  warning?: string | null;
  metrics?: {
    sectionCount?: number;
    figureCount?: number;
    tableCount?: number;
    textLength?: number;
  };
};

const PRIMARY_DISPLAY_LAYERS = new Set<EntityLayer>(['source', 'capability', 'world', 'foundation']);

export function getDisplayLayer(entity: Pick<Entity, 'layer' | 'type'> | string): DisplayLayer {
  const layer = getEntityLayer(entity);
  return PRIMARY_DISPLAY_LAYERS.has(layer) ? (layer as DisplayLayer) : 'foundation';
}

export function getProjectStats(entities: Entity[]): ProjectStats {
  return entities.reduce<ProjectStats>((stats, entity) => {
    stats[getDisplayLayer(entity)] += 1;
    return stats;
  }, {
    source: 0,
    capability: 0,
    world: 0,
    foundation: 0
  });
}

export function getProjectQuality(project: Project, entities: Entity[]): ProjectQuality {
  const decomposition = project.metadata?.decomposition as DecompositionView | undefined;
  const sourceCoverage = project.metadata?.sourceCoverage as SourceCoverageView | undefined;
  const admission = project.metadata?.admission;
  const stats = getProjectStats(entities);
  const confidence = typeof decomposition?.confidence === 'number'
    ? decomposition.confidence
    : null;
  const rawMethod = decomposition?.provenance?.extractionMethod || 'pending';
  const method = formatExtractionMethod(rawMethod);
  const relations = (decomposition?.bridgeRelations?.length || 0)
    + Math.max(0, stats.capability + stats.world + stats.foundation - 1);

  const notes: ProjectQualityNote[] = [];

  if (!decomposition) {
    return {
      level: 'pending',
      label: project.analysis?.status === 'failed' ? 'Failed' : 'Pending',
      method: project.analysis?.currentPhase || project.analysis?.status || 'importing',
      relations: 0,
      summary: project.analysis?.error || 'The source is still being processed.',
      coverage: null,
      notes
    };
  }

  if (rawMethod === 'metadata') {
    notes.push({ text: 'metadata-only extraction', level: 'warning' });
  }

  const coverage = buildProjectCoverageSummary(sourceCoverage);

  if (decomposition.extractionMetadata?.llmExtraction?.success === false) {
    notes.push({ text: 'LLM extraction unavailable', level: 'warning' });
  }

  if (rawMethod === 'source-text-fallback') {
    const fallback = decomposition.extractionMetadata?.textFallbackExtraction;
    const fallbackCount = (fallback?.capabilityCount || 0)
      + (fallback?.worldCount || 0)
      + (fallback?.evidenceCount || 0);
    notes.push({
      text: fallbackCount > 0
        ? 'source-text fallback produced reviewable structure'
        : 'source-text fallback extraction',
      level: 'info'
    });
  }

  if (admission?.depth === 'light') {
    notes.push({ text: 'light admission depth', level: 'info' });
  }

  if (stats.world === 0) {
    notes.push({ text: 'no spatial anchor', level: 'info' });
  }

  if (stats.capability === 0) {
    notes.push({ text: 'no method or resource structure', level: 'warning' });
  }

  if ((decomposition.evidenceObjects?.length || 0) === 0) {
    notes.push({ text: 'no evidence chain', level: 'info' });
  }

  const breadthScore =
    (stats.source > 0 ? 1 : 0)
    + (stats.capability > 0 ? 1 : 0)
    + (stats.world > 0 ? 1 : 0)
    + ((decomposition.evidenceObjects?.length || 0) > 0 ? 1 : 0);

  const level = getProjectQualityLevel(confidence, breadthScore, stats, entities.length);
  const labels: Record<ProjectQualityLevel, string> = {
    excellent: 'Strong Graph',
    useful: 'Useful Graph',
    partial: 'Partial Graph',
    limited: 'Limited Graph',
    pending: 'Pending'
  };

  const confidenceText = confidence === null ? 'unknown confidence' : `${Math.round(confidence * 100)}% confidence`;
  const summary = `Research structure extracted with ${confidenceText}.`;

  return {
    level,
    label: labels[level],
    method,
    relations,
    summary,
    coverage,
    notes
  };
}

export function getProjectProgressSteps(project: Project): ProjectProgressStep[] {
  const progress = project.analysis?.progress;
  const completed = new Set(progress?.completed || []);
  const inProgress = progress?.inProgress || project.analysis?.currentPhase || null;
  const failed = project.analysis?.status === 'failed';

  const phases = [
    { key: 'fetching', label: 'Source', detail: 'Resolve metadata and source text' },
    { key: 'admission', label: 'Admission', detail: 'Assess Digital Earth relevance' },
    { key: 'decomposition', label: 'Structure', detail: 'Extract evidence, methods, places, and links' },
    { key: 'storing', label: 'Graph', detail: 'Store entities and relations' }
  ];

  return phases.map(phase => {
    let status: ProjectProgressStep['status'] = 'pending';

    if (completed.has(phase.key) || project.metadata?.decomposition) {
      status = 'done';
    } else if (failed && inProgress === phase.key) {
      status = 'failed';
    } else if (inProgress === phase.key) {
      status = 'active';
    }

    return { ...phase, status };
  });
}

export function getSourceCapsule(project: Project, quality: ProjectQuality | null): SourceCapsule {
  const decomposition = project.metadata?.decomposition as DecompositionView | undefined;
  const sourceObject = decomposition?.sourceObject || {};
  const sourceCoverage = project.metadata?.sourceCoverage as SourceCoverageView | undefined;
  const title = sourceObject.name
    || sourceObject.title
    || sourceObject.attributes?.title
    || sourceObject.attributes?.name
    || project.name
    || 'Untitled source';

  const confidence = typeof decomposition?.confidence === 'number'
    ? `${Math.round(decomposition.confidence * 100)}%`
    : 'Unknown';

  return {
    title,
    type: sourceObject.type || project.metadata?.sourceType || 'Source',
    source: selectExternalSourceLink([
      sourceObject.attributes?.url,
      sourceObject.attributes?.identifier,
      project.metadata?.source,
      quality?.coverage?.source,
      sourceCoverage?.source
    ]),
    depth: formatSignalText(project.metadata?.admission?.depth || 'pending'),
    extraction: quality?.method || 'Pending',
    confidence
  };
}

function selectExternalSourceLink(candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const value = candidate.trim();
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    if (/^10\.\d{4,9}\//.test(value)) return `https://doi.org/${value}`;
  }
  return null;
}

export function getObjectConstellation(entities: Entity[]): ObjectConstellationNode[] {
  const groups = groupEntitiesByLayerForView(entities);

  return (['source', 'capability', 'world', 'foundation'] as DisplayLayer[])
    .map(layer => {
      const items = groups[layer];
      if (items.length === 0) return null;

      return {
        id: layer,
        label: formatSignalText(layer),
        type: layer,
        layer,
        count: items.length,
        sampleEntityId: items[0]?.id || null
      };
    })
    .filter(Boolean) as ObjectConstellationNode[];
}

export function getRecommendedNextActions(
  project: Project | null,
  quality: ProjectQuality | null,
  stats: ProjectStats,
  objectCount: number
): ProjectNextAction[] {
  if (Array.isArray(project?.metadata?.importActions) && project.metadata.importActions.length > 0) {
    return project.metadata.importActions.map(normalizeProjectAction).slice(0, 4);
  }

  if (!quality || quality.level === 'pending') {
    return [
      { label: 'Wait for import completion', targetLayer: null },
      { label: 'Review source coverage once extraction finishes', targetLayer: 'source' }
    ];
  }

  const actions: ProjectNextAction[] = [];

  if (quality.coverage?.warning) {
    actions.push({ label: 'Inspect source coverage', targetLayer: 'source' });
  }
  if (stats.world === 0) {
    actions.push({ label: 'Add or verify spatial scope', targetLayer: 'world', fallbackLayer: 'source' });
  }
  if (stats.capability === 0) {
    actions.push({ label: 'Attach methods, data, or code', targetLayer: 'capability', fallbackLayer: 'source' });
  }
  if (quality.relations === 0 && objectCount > 1) {
    actions.push({ label: 'Review missing research links', targetLayer: 'source', fallbackLayer: 'capability' });
  }
  if (quality.notes.some(note => note.text.includes('fallback') || note.text.includes('metadata-only'))) {
    actions.push({ label: 'Verify extraction before using it', targetLayer: 'source', fallbackLayer: 'capability' });
  }

  actions.push({ label: 'Open a detail to inspect evidence', targetLayer: 'foundation', fallbackLayer: 'source' });

  const seen = new Set<string>();
  return actions.filter(action => {
    if (seen.has(action.label)) return false;
    seen.add(action.label);
    return true;
  }).slice(0, 4);
}

function normalizeProjectAction(action: ProjectActionItem): ProjectNextAction {
  return {
    ...action,
    operation: action.operation || 'inspect',
    targetLayer: normalizeDisplayLayer(action.targetLayer),
    fallbackLayer: normalizeDisplayLayer(action.fallbackLayer)
  };
}

function normalizeDisplayLayer(layer?: string | null): DisplayLayer | null {
  if (layer === 'source' || layer === 'capability' || layer === 'world' || layer === 'foundation') {
    return layer;
  }

  return null;
}

export function getProjectDiagnosis(
  project: Project,
  quality: ProjectQuality | null,
  stats: ProjectStats,
  objectCount: number
): ProjectDiagnosisItem[] {
  if (Array.isArray(project.metadata?.importDiagnosis) && project.metadata.importDiagnosis.length > 0) {
    return project.metadata.importDiagnosis;
  }

  if (!quality || quality.level === 'pending') {
    return [
      {
        key: 'pipeline',
        label: 'Pipeline',
        status: project.analysis?.status === 'failed' ? 'missing' : 'pending',
        value: project.analysis?.status === 'failed' ? 'Failed' : 'Processing',
        detail: project.analysis?.error || 'Source resolution and object extraction are still running.'
      }
    ];
  }

  const decomposition = project.metadata?.decomposition as DecompositionView | undefined;
  const evidenceCount = decomposition?.evidenceObjects?.length || 0;
  const isMetadataOnly = quality.notes.some(note => note.text.includes('metadata-only'));
  const usedFallback = quality.notes.some(note => note.text.includes('fallback'));
  const sourceStatus: ProjectDiagnosisStatus = isMetadataOnly || usedFallback ? 'limited' : 'ready';
  const extractionValue = isMetadataOnly
    ? 'Metadata only'
    : usedFallback
      ? 'Fallback'
      : quality.method;

  return [
    {
      key: 'source',
      label: 'Source',
      status: sourceStatus,
      value: extractionValue,
      detail: isMetadataOnly
        ? 'Only citation metadata was available, so Teruvion cannot infer regions, methods, or evidence with high confidence.'
        : usedFallback
          ? 'The system used source text fallback; extracted structure should be reviewed before product use.'
          : quality.coverage?.detail || 'Source coverage is sufficient for object extraction.'
    },
    {
      key: 'spatial',
      label: 'Spatial Anchor',
      status: stats.world > 0 ? 'ready' : 'missing',
      value: stats.world > 0 ? 'Detected' : 'Missing',
      detail: stats.world > 0
        ? 'Map views can focus on extracted regions, events, or Earth system context.'
        : 'No region, bbox, event location, or Earth system context was extracted yet; the map stays global until a spatial anchor exists.'
    },
    {
      key: 'capability',
      label: 'Methods & Data',
      status: stats.capability > 0 ? 'ready' : 'missing',
      value: stats.capability > 0 ? 'Inspectable' : 'Missing',
      detail: stats.capability > 0
        ? 'Methods, datasets, workflows, or computing resources are available for inspection.'
        : 'No method, dataset, workflow, model, or repository capability was extracted from this source.'
    },
    {
      key: 'evidence',
      label: 'Evidence',
      status: evidenceCount > 0 ? 'ready' : 'limited',
      value: evidenceCount > 0 ? 'Traceable' : 'Sparse',
      detail: evidenceCount > 0
        ? 'Claims or evidence chains are available for review.'
        : 'The current research graph has little claim-level evidence; treat conclusions as provisional.'
    },
    {
      key: 'graph',
      label: 'Research Links',
      status: quality.relations > 0 ? 'ready' : objectCount > 1 ? 'limited' : 'missing',
      value: quality.relations > 0 ? 'Linked' : 'Sparse',
      detail: quality.relations > 0
        ? 'The research structure is linked enough to support graph inspection and comparison.'
        : 'The research structure is not connected enough yet; relation extraction or manual review is needed.'
    }
  ];
}

export function getProjectReadiness(project: Project, diagnosis: ProjectDiagnosisItem[]): ProjectReadinessSummary {
  if (project.metadata?.importReadiness) {
    return project.metadata.importReadiness;
  }

  const counts = diagnosis.reduce<Record<ProjectDiagnosisStatus, number>>((summary, item) => {
    summary[item.status] += 1;
    return summary;
  }, {
    ready: 0,
    limited: 0,
    missing: 0,
    pending: 0
  });
  const total = diagnosis.length;
  const score = total > 0 ? Math.round((counts.ready / total) * 100) : 0;
  const blockers = diagnosis
    .filter(item => item.status === 'missing' || item.status === 'limited')
    .map(item => item.label)
    .slice(0, 3);
  const pipeline = diagnosis.find(item => item.key === 'pipeline');

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
      nextStep: 'Open research details, inspect evidence, or compare this project with another source.'
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

export function buildProjectSummaryText(project: Project, quality: ProjectQuality, stats: ProjectStats, objectCount: number) {
  const lines = [
    `# ${project.name}`,
    '',
    `Quality: ${quality.label}`,
    `Extraction: ${quality.method}`,
    `Research structure: ${quality.label}`,
    `Spatial context: ${stats.world > 0 ? 'Detected' : 'Missing'}`,
    `Methods and resources: ${stats.capability > 0 ? 'Inspectable' : 'Missing'}`,
    `Research links: ${quality.relations > 0 ? 'Linked' : 'Sparse'}`,
    `Summary: ${quality.summary}`
  ];

  if (quality.notes.length > 0) {
    lines.push('', 'Notes:', ...quality.notes.map(note => `- ${note.text}`));
  }

  if (quality.coverage) {
    lines.push(
      '',
      'Source coverage:',
      `- ${quality.coverage.label}: ${quality.coverage.detail}`
    );

    if (quality.coverage.metrics.length > 0) {
      lines.push(...quality.coverage.metrics.map(metric => `- ${metric.label}: ${metric.value}`));
    }

    if (quality.coverage.warning) {
      lines.push(`- Warning: ${quality.coverage.warning}`);
    }
  }

  return lines.join('\n');
}

function groupEntitiesByLayerForView(entities: Entity[]): Record<DisplayLayer, Entity[]> {
  return entities.reduce<Record<DisplayLayer, Entity[]>>((groups, entity) => {
    groups[getDisplayLayer(entity)].push(entity);
    return groups;
  }, {
    source: [],
    capability: [],
    world: [],
    foundation: []
  });
}

function buildProjectCoverageSummary(sourceCoverage?: SourceCoverageView): ProjectCoverageSummary | null {
  if (!sourceCoverage || sourceCoverage.contentLevel === 'unknown') {
    return null;
  }

  const metrics: Array<{ label: string; value: string }> = [];
  const sectionCount = sourceCoverage.metrics?.sectionCount || 0;
  const figureCount = sourceCoverage.metrics?.figureCount || 0;
  const tableCount = sourceCoverage.metrics?.tableCount || 0;
  const visualCount = figureCount + tableCount;
  const textLength = sourceCoverage.metrics?.textLength || 0;

  if (sectionCount > 0) {
    metrics.push({ label: 'sections', value: String(sectionCount) });
  }

  if (visualCount > 0) {
    metrics.push({ label: 'visuals', value: String(visualCount) });
  }

  if (textLength > 0) {
    metrics.push({ label: 'chars', value: formatCompactNumber(textLength) });
  }

  return {
    label: sourceCoverage.label || formatSignalText(sourceCoverage.contentLevel || 'source'),
    detail: sourceCoverage.detail || 'Source coverage recorded for this import.',
    source: sourceCoverage.source,
    metrics,
    warning: sourceCoverage.warning || null
  };
}

function getProjectQualityLevel(
  confidence: number | null,
  breadthScore: number,
  stats: ProjectStats,
  objectCount: number
): ProjectQualityLevel {
  if ((confidence ?? 0) >= 0.75 && breadthScore >= 3) return 'excellent';
  if ((confidence ?? 0) >= 0.55 && stats.capability > 0 && objectCount >= 3) return 'useful';
  if (objectCount > 1) return 'partial';
  return 'limited';
}

function formatExtractionMethod(method: string) {
  const labels: Record<string, string> = {
    hybrid: 'Hybrid extraction',
    metadata: 'Metadata only',
    'source-text-fallback': 'Source text fallback',
    none: 'No extraction',
    pending: 'Pending'
  };

  return labels[method] || formatSignalText(method);
}

function formatCompactNumber(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
}
