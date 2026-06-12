import type { Entity, EntityExploreResponse, EntityLayer } from '../types/api';
import { getEntityLayer } from '../types/api';

export type EntitySignalLevel = 'strong' | 'normal' | 'weak';

export interface EntitySignal {
  label: string;
  value: string;
  level: EntitySignalLevel;
}

export interface EntityReviewNote {
  text: string;
  level: 'warning' | 'info';
}

const SPATIAL_FIELDS = [
  'bbox',
  'location',
  'centroid',
  'coordinates',
  'geometry',
  'polygon',
  'spatialCoverage'
] as const;

const TEMPORAL_FIELDS = [
  'year',
  'date',
  'time',
  'timestamp',
  'start',
  'end',
  'publishedAt',
  'createdAt',
  'updatedAt',
  'temporalCoverage',
  'temporalSpan'
] as const;

const TEMPORAL_REVIEW_LAYERS = new Set<EntityLayer>(['source', 'capability', 'world']);
const TEMPORAL_REVIEW_CATEGORIES = new Set([
  'academic',
  'data',
  'report',
  'news',
  'policy',
  'earth-object',
  'hazard',
  'risk',
  'model-output',
  'scenario'
]);

export function getEntityName(entity: Pick<Entity, 'id' | 'name' | 'attributes'>) {
  return entity.name
    || entity.attributes.name
    || entity.attributes.title
    || entity.attributes.label
    || entity.id;
}

export function hasSpatialMetadata(entity: Entity) {
  return SPATIAL_FIELDS.some(field => hasMeaningfulValue(entity.attributes[field]));
}

export function hasTemporalMetadata(entity: Entity) {
  return TEMPORAL_FIELDS.some(field => hasMeaningfulValue(entity.attributes[field]));
}

export function getEntitySignals(entity: Entity, explore: EntityExploreResponse | null): EntitySignal[] {
  const signals: EntitySignal[] = [];
  const confidence = typeof entity.metadata?.confidence === 'number' ? entity.metadata.confidence : null;
  const verification = entity.verificationState || 'unverified';
  const connectionCount = explore?.relatedEntities?.length || 0;
  const sourceCount = explore?.sources?.length || 0;
  const hasSource = Boolean(entity.metadata?.source) || sourceCount > 0;
  const hasSpatial = hasSpatialMetadata(entity);
  const hasTemporal = hasTemporalMetadata(entity);

  signals.push({
    label: 'Confidence',
    value: confidence === null ? 'Unknown' : `${Math.round(confidence * 100)}%`,
    level: confidence === null ? 'weak' : confidence >= 0.7 ? 'strong' : confidence >= 0.45 ? 'normal' : 'weak'
  });

  signals.push({
    label: 'Verification',
    value: formatSignalText(verification),
    level: verification === 'verified' ? 'strong' : verification === 'rejected' ? 'weak' : 'normal'
  });

  signals.push({
    label: 'Connections',
    value: `${connectionCount}`,
    level: connectionCount > 2 ? 'strong' : connectionCount > 0 ? 'normal' : 'weak'
  });

  signals.push({
    label: 'Source',
    value: hasSource ? entity.metadata?.source ? 'Recorded' : `${sourceCount} link${sourceCount === 1 ? '' : 's'}` : 'Missing',
    level: hasSource ? 'strong' : 'weak'
  });

  signals.push({
    label: 'Spatial',
    value: hasSpatial ? 'Present' : 'None',
    level: hasSpatial ? 'strong' : 'normal'
  });

  signals.push({
    label: 'Temporal',
    value: hasTemporal ? 'Present' : 'None',
    level: hasTemporal ? 'strong' : 'normal'
  });

  return signals;
}

export function getEntityReviewNotes(
  entity: Entity,
  explore: EntityExploreResponse | null,
  signals: EntitySignal[]
): EntityReviewNote[] {
  const notes: EntityReviewNote[] = [];
  const signalByLabel = new Map(signals.map(signal => [signal.label, signal]));
  const confidenceSignal = signalByLabel.get('Confidence');
  const sourceSignal = signalByLabel.get('Source');
  const connectionsSignal = signalByLabel.get('Connections');
  const spatialSignal = signalByLabel.get('Spatial');
  const temporalSignal = signalByLabel.get('Temporal');
  const layer = getEntityLayer(entity);

  if (confidenceSignal?.level === 'weak') {
    notes.push({
      text: 'Treat this object as tentative until confidence improves or a human reviews it.',
      level: 'warning'
    });
  }

  if (sourceSignal?.level === 'weak') {
    notes.push({
      text: 'Source evidence is missing; check the original import or linked source object before relying on it.',
      level: 'warning'
    });
  }

  if (connectionsSignal?.value === '0') {
    notes.push({
      text: 'No graph connections yet; this object is not contributing much to reasoning or comparison.',
      level: 'info'
    });
  }

  if (layer === 'world' && spatialSignal?.value === 'None') {
    notes.push({
      text: 'World object has no spatial footprint; map behavior may be limited.',
      level: 'warning'
    });
  }

  if (shouldReviewTemporalMetadata(entity) && temporalSignal?.value === 'None') {
    notes.push({
      text: 'No temporal metadata detected; timeline views may stay sparse.',
      level: 'info'
    });
  }

  if ((explore?.capabilities?.length || 0) > 0) {
    notes.push({
      text: `Suggested checks: ${explore!.capabilities.slice(0, 3).join(', ')}.`,
      level: 'info'
    });
  }

  return notes.slice(0, 4);
}

export function shouldReviewTemporalMetadata(entity: Entity) {
  const layer = getEntityLayer(entity);
  const category = entity.category || '';
  return TEMPORAL_REVIEW_LAYERS.has(layer) && TEMPORAL_REVIEW_CATEGORIES.has(category);
}

export function formatSignalText(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function hasMeaningfulValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}
