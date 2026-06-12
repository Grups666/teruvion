import type { Decomposition, Entity, EntityLayer, Project } from '../types/api';
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
        ? `source-text fallback produced ${fallbackCount} reviewable objects`
        : 'source-text fallback extraction',
      level: 'info'
    });
  }

  if (admission?.depth === 'light') {
    notes.push({ text: 'light admission depth', level: 'info' });
  }

  if (stats.world === 0) {
    notes.push({ text: 'no spatial/world objects', level: 'info' });
  }

  if (stats.capability === 0) {
    notes.push({ text: 'no capability objects', level: 'warning' });
  }

  if ((decomposition.evidenceObjects?.length || 0) === 0) {
    notes.push({ text: 'no evidence objects', level: 'info' });
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
  const summary = `${entities.length} objects extracted with ${confidenceText}.`;

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

export function buildProjectSummaryText(project: Project, quality: ProjectQuality, stats: ProjectStats, objectCount: number) {
  const lines = [
    `# ${project.name}`,
    '',
    `Quality: ${quality.label}`,
    `Extraction: ${quality.method}`,
    `Objects: ${objectCount}`,
    `Layers: ${stats.source} source, ${stats.capability} capability, ${stats.world} world, ${stats.foundation} other`,
    `Relations: ${quality.relations}`,
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
