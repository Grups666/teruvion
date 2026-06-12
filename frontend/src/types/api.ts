/**
 * API Types - Contract between frontend and backend
 *
 * These types define the API response shapes.
 * Frontend should only depend on these types, not backend internals.
 */

// Entity types
export interface Entity {
  id: string;
  type: string;
  name?: string;
  layer?: EntityLayer;
  category?: string;
  attributes: {
    name?: string;
    title?: string;
    label?: string;
    bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
    [key: string]: any;
  };
  metadata?: {
    projectId?: string;
    confidence?: number;
    source?: string;
    [key: string]: any;
  };
  verificationState?: string;
  createdAt?: string;
}

// Project types
export interface Project {
  id: string;
  name: string;
  description?: string;
  entities: string[];
  metadata?: {
    decomposition?: Decomposition;
    admission?: AdmissionResult;
    [key: string]: any;
  };
  analysis?: AnalysisProgress;
}

export interface AnalysisProgress {
  status: 'pending' | 'importing' | 'analyzing' | 'completed' | 'failed';
  currentPhase?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string | null;
  progress?: {
    completed: string[];
    inProgress: string | null;
    pending: string[];
    details: Record<string, any>;
  };
}

export interface Decomposition {
  sourceObject?: any;
  capabilityObjects?: any[];
  worldObjects?: any[];
  evidenceObjects?: any[];
  bridgeRelations?: any[];
}

export interface AdmissionResult {
  admitted: boolean;
  depth: 'deep' | 'structured' | 'light' | 'reject';
  primaryRole?: string;
  sourceRoles?: Record<string, number>;
  reasoning?: string;
}

// API Response types
export interface EntitiesResponse {
  entities: Entity[];
  count: number;
}

export interface ProjectsResponse {
  projects: Project[];
  count: number;
}

export interface ImportResponse {
  success: boolean;
  projectId: string;
  status: string;
}

export interface RelatedEntity {
  id: string;
  type: string;
  name: string;
  layer?: EntityLayer;
  category?: string;
  relation: string;
  direction: 'incoming' | 'outgoing';
  confidence?: number;
  isFallback?: boolean;
  provenance?: Record<string, any>;
  verificationState?: string;
}

export interface EntityExploreResponse {
  entity: {
    id: string;
    type: string;
    name: string;
    layer: EntityLayer;
    category?: string;
    attributes: Record<string, any>;
  };
  relatedEntities: RelatedEntity[];
  sources: string[];
  capabilities: string[];
  relations: Array<{
    type: string;
    from: string;
    to: string;
    confidence: number;
    isFallback?: boolean;
    provenance?: Record<string, any>;
    verificationState?: string;
  }>;
}

export interface SSEStatusEvent {
  type: 'status' | 'progress';
  data: {
    status: string;
    phase?: string;
    currentPhase?: string;
    progress?: AnalysisProgress;
    [key: string]: any;
  };
}

export interface SSECompletedEvent {
  type: 'completed';
  data: {
    status: 'completed';
    entities: number;
    relations: number;
  };
}

export interface SSEErrorEvent {
  type: 'error';
  data: {
    status: 'failed';
    error: string;
  };
}

export type SSEEvent = SSEStatusEvent | SSECompletedEvent | SSEErrorEvent;

// Entity layer classification
export type EntityLayer = 'world' | 'capability' | 'source' | 'foundation' | 'domain' | 'extension' | 'unknown';

export function getEntityLayer(entity: Pick<Entity, 'layer' | 'type'> | string): EntityLayer {
  if (typeof entity === 'string') return 'foundation';
  return entity.layer || 'foundation';
}

// Alpha Access types
export interface AlphaApplication {
  id: string;
  name: string;
  email: string;
  affiliation: string;
  researchField: string;
  intendedUse: string;
  websiteOrProfile?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface AlphaApplicationInput {
  name: string;
  email: string;
  affiliation: string;
  researchField: string;
  intendedUse: string;
  websiteOrProfile?: string;
}

export interface AlphaInvite {
  code: string;
  email: string;
  status: 'active' | 'used';
  createdAt: string;
  usedAt?: string;
}

export interface AlphaMembership {
  id: string;
  email: string;
  name: string;
  role: 'alpha_user' | 'admin';
  plan: 'alpha_preview';
  quota: {
    maxJobsPerMonth: number;
    maxSourcesPerJob: number;
  };
  createdAt: string;
}
