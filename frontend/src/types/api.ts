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
    projectRecomposition?: ProjectRecomposition;
    mapRecomposition?: ProjectMapRecomposition;
    admission?: AdmissionResult;
    importDiagnosis?: ProjectDiagnosisItem[];
    importReadiness?: ProjectReadinessSummary;
    importActions?: ProjectActionItem[];
    [key: string]: any;
  };
  analysis?: AnalysisProgress;
}

export interface ProjectRecomposition {
  schemaVersion: 'project-recomposition-v1' | string;
  generatedAt?: string;
  sourceCount: number;
  sources: Array<{
    id: string;
    type: string;
    title: string;
    url?: string | null;
    brief: {
      oneLine?: string;
      keyPointCount?: number;
      keyPoints?: Array<{
        id?: string;
        label: string;
        value: string;
        detail?: string;
        provenance?: Record<string, any> | null;
      }>;
    };
    extraction?: {
      method?: string;
      confidence?: number | null;
      depth?: string | null;
    };
    objectCounts?: Record<string, number>;
    coverage?: {
      level?: string | null;
      label?: string | null;
      detail?: string | null;
    } | null;
    route?: Record<string, any>;
    visualEvidence?: Record<string, any>;
    resources?: Record<string, any>;
    integrity?: Record<string, any>;
  }>;
  aggregate: {
    brief?: {
      title?: string;
      oneLine?: string;
      keyPointCount?: number;
      keyPoints?: Array<{
        id?: string;
        label: string;
        value: string;
        detail?: string;
        sourceId?: string;
        sourceTitle?: string;
        provenance?: Record<string, any> | null;
      }>;
    };
    objectCounts?: Record<string, number>;
    route?: {
      nodeCount?: number;
      edgeCount?: number;
      stages?: string[];
      nodes?: Array<{
        id: string;
        sourceId?: string;
        label: string;
        stage?: string | null;
        summary?: string;
        provenance?: Record<string, any> | null;
        support?: Record<string, any> | null;
      }>;
      edges?: Array<{
        from: string;
        to: string;
        label?: string;
        sourceId?: string;
      }>;
    };
    visualEvidence?: {
      count?: number;
      explainedCount?: number;
      items?: Array<{
        id?: string;
        sourceId?: string;
        label?: string;
        kind?: string;
        caption?: string;
        imageUrl?: string | null;
        originalImageUrl?: string | null;
        tableData?: {
          headers?: string[];
          rows?: string[][];
        } | null;
        sourceUrl?: string | null;
        routeRole?: string;
        supports?: string;
        readHint?: string;
        interpretation?: string;
        howProduced?: string;
        supportedClaim?: string;
        provenance?: Record<string, any> | null;
      }>;
    };
    resources?: {
      count?: number;
      reusableCount?: number;
      linkedCount?: number;
      items?: Array<{
        id?: string;
        sourceId?: string;
        label?: string;
        url?: string | null;
        type?: string;
        role?: string;
        source?: string;
        context?: string;
        investigationLabel?: string;
        routeRelevance?: string;
        verificationFocus?: string;
        reviewHint?: string;
        reproducibilityGrade?: string | null;
        linked?: boolean;
      }>;
    };
    limitations?: Array<{
      id?: string;
      kind?: string;
      label: string;
      detail: string;
      severity?: 'info' | 'warning' | 'error' | string;
      source?: string | null;
      sourceId?: string;
      provenance?: Record<string, any> | null;
    }>;
    integrity?: {
      status?: string;
      warningCount?: number;
      issueCount?: number;
      weakSourceIds?: string[];
    };
    productQuality?: SourceObjectGraphQuality;
  };
}

export interface ProjectMapRecomposition {
  schemaVersion: 'map-recomposition-v1' | string;
  generatedAt?: string;
  sourceCount: number;
  sources: Array<{
    id: string;
    title: string;
    type: string;
    coverage?: {
      level?: string | null;
      label?: string | null;
    } | null;
    admission?: {
      depth?: string | null;
      primaryRole?: string | null;
    } | null;
  }>;
  map: {
    primaryMode?: string;
    anchors?: Array<Record<string, any>>;
    layers?: Array<{
      id: string;
      displayPrimitive: string;
      label: string;
      anchorCount?: number;
      resultCount?: number;
      anchorIds?: string[];
      resultIds?: string[];
      evidenceRequired?: boolean;
    }>;
    attachments?: Array<Record<string, any>>;
    results?: Array<Record<string, any>>;
    viewPlan?: {
      schemaVersion?: string;
      primaryVisual?: string;
      interaction?: Record<string, any>;
      styling?: {
        colorBy?: string | null;
        sizeBy?: string | null;
        lineBy?: string | null;
        opacityBy?: string | null;
        palette?: string | null;
      };
      legend?: {
        type?: string;
        title?: string;
        items?: Array<{
          value?: string;
          count?: number;
        }>;
      };
      inspector?: {
        titleFields?: string[];
        metricFields?: Array<{
          field: string;
          role?: string;
          coverage?: number;
        }>;
        descriptorFields?: string[];
        timeSeriesFields?: string[];
        evidenceFields?: Array<Record<string, any>>;
        resourceFields?: Array<Record<string, any>>;
      };
      diagnostics?: Record<string, any>;
    };
    diagnostics?: {
      status?: string;
      anchorCount?: number;
      renderableAnchorCount?: number;
      unlocatedAnchorCount?: number;
      resultCount?: number;
      renderableResultCount?: number;
      attachedResultCount?: number;
      attachmentCount?: number;
      sourceFigureOnlyCount?: number;
      visualizationMode?: string | null;
      warnings?: string[];
    };
  };
}

export interface SourceObjectGraphQuality {
  schemaVersion?: string;
  level?: 'product_ready' | 'reviewable' | 'weak' | string;
  score?: number;
  weakComponents?: string[];
  reasons?: string[];
  components?: Record<string, {
    label?: string;
    level?: string;
    score?: number;
    reasons?: string[];
  }>;
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
  extractionMetadata?: {
    researchRoute?: {
      source?: string;
      nodeCount?: number;
      edgeCount?: number;
      quality?: 'content' | 'partial' | 'limited' | string;
      contentNodeCount?: number;
      stageCount?: number;
      reasons?: string[];
    };
    [key: string]: any;
  };
  researchBrief?: {
    title?: string;
    sourceType?: string;
    authors?: string;
    institutions?: string;
    year?: string | number | null;
    venue?: string | null;
    url?: string | null;
    oneLine?: string;
    keyPoints?: Array<{
      id?: string;
      label: string;
      value: string;
      detail: string;
    }>;
    confidence?: number;
    provenance?: Record<string, any>;
  };
  workflowOutline?: {
    title?: string;
    summary?: string;
    nodes?: Array<{
      id: string;
      objectId?: string;
      label: string;
      type?: string;
      stage?: string;
      stageOrder?: number;
      objectType?: string;
      summary?: string;
      status?: 'ready' | 'review' | 'blocked' | 'pending';
      children?: Array<{
        label: string;
        value: string;
        detail?: string;
        children?: Array<{
          label: string;
          value: string;
          detail?: string;
        }>;
      }>;
    }>;
    edges?: Array<{
      from: string;
      to: string;
      label?: string;
    }>;
    provenance?: Record<string, any>;
  };
  externalResources?: Array<{
    label: string;
    url: string;
    type?: string;
    role?: string;
    source?: string;
    context?: string;
    investigationLabel?: string;
    routeRelevance?: string;
    verificationFocus?: string;
    reproducibilityGrade?: string;
    enrichment?: Record<string, any>;
    reviewHint?: string;
  }>;
  resourceGraph?: {
    nodes?: Array<{
      id: string;
      kind?: string;
      label?: string;
      type?: string;
      role?: string;
      url?: string;
      routeRelevance?: string;
      verificationFocus?: string;
      reviewHint?: string;
      reproducibilityGrade?: string | null;
      source?: string;
      summary?: string;
      routeNodeId?: string;
    }>;
    edges?: Array<{
      from: string;
      to: string;
      label?: string;
      confidence?: number;
      provenance?: Record<string, any>;
    }>;
    summary?: {
      resourceCount?: number;
      repositoryCount?: number;
      datasetCount?: number;
      linkedResourceCount?: number;
      reusableResourceCount?: number;
      [key: string]: any;
    };
    provenance?: Record<string, any>;
  };
  evidenceGraph?: {
    nodes?: Array<{
      id: string;
      kind?: string;
      label?: string;
      summary?: string;
      sourceUrl?: string;
      imageUrl?: string | null;
      role?: string;
      routeNodeId?: string;
      provenance?: Record<string, any>;
      confidence?: number | null;
    }>;
    edges?: Array<{
      from: string;
      to: string;
      label?: string;
      confidence?: number;
      provenance?: Record<string, any>;
    }>;
    summary?: {
      claimCount?: number;
      visualCount?: number;
      resourceCount?: number;
      linkedClaimCount?: number;
      [key: string]: any;
    };
    provenance?: Record<string, any>;
  };
  extractionIntegrity?: {
    status?: 'ready' | 'needs_review' | string;
    routeQuality?: {
      level?: 'content' | 'partial' | 'limited' | string;
      contentNodeCount?: number;
      stageCount?: number;
      edgeCount?: number;
      detailNodeCount?: number;
      informativeNodeCount?: number;
      lowInformationNodeCount?: number;
      informationScore?: number;
      reasons?: string[];
      [key: string]: any;
    };
    graphTraceability?: {
      level?: 'traceable' | 'partial' | 'weak' | 'unknown' | string;
      score?: number;
      routeNodeCount?: number;
      traceableNodeCount?: number;
      weakNodeCount?: number;
      untracedNodeCount?: number;
      details?: Array<Record<string, any>>;
      reasons?: string[];
    };
    contentFidelity?: {
      level?: 'content' | 'partial' | 'weak' | 'unknown' | string;
      score?: number;
      expectedFacets?: string[];
      coveredFacets?: string[];
      missingFacets?: string[];
      grounding?: {
        score?: number;
        groundedFacets?: string[];
        weaklyGroundedFacets?: string[];
        ungroundedFacets?: string[];
        details?: Record<string, any>;
      };
      internalRouteLabels?: string[];
      reasons?: string[];
    };
    visualEvidenceQuality?: {
      level?: 'complete' | 'partial' | 'weak' | 'missing' | 'not_applicable' | string;
      expectedCount?: number;
      visualCount?: number;
      captionCount?: number;
      explainedCount?: number;
      producedCount?: number;
      supportedClaimCount?: number;
      evidenceLinkedCount?: number;
      groundedCount?: number;
      expectedCoverage?: number;
      explanationCoverage?: number;
      groundingCoverage?: number;
      reasons?: string[];
    };
    resourceGraphQuality?: {
      level?: 'complete' | 'partial' | 'weak' | 'not_applicable' | string;
      resourceCount?: number;
      linkedResourceCount?: number;
      reusableResourceCount?: number;
      llmLinkedCount?: number;
      roleCount?: number;
      verificationFocusCount?: number;
      provenanceLinkedCount?: number;
      linkCoverage?: number;
      reusableLinkCoverage?: number;
      reviewCoverage?: number;
      reasons?: string[];
    };
    briefQuality?: {
      level?: 'complete' | 'partial' | 'weak' | 'missing' | string;
      pointCount?: number;
      informativePointCount?: number;
      groundedPointCount?: number;
      lowInformationPointCount?: number;
      ungroundedPointCount?: number;
      informationScore?: number;
      groundingScore?: number;
      missingExpected?: string[];
      reasons?: string[];
    };
    productReadiness?: SourceObjectGraphQuality;
    missingBibliographicFields?: string[];
    schemaWarningCount?: number;
    unknownRelationCount?: number;
    endpointReviewRelationCount?: number;
    scopeFilteredCount?: number;
    evidenceGraph?: Record<string, any> | null;
    resourceGraph?: Record<string, any> | null;
    issues?: Array<{
      id?: string;
      severity?: 'info' | 'warning' | 'error' | string;
      detail?: string;
    }>;
  };
  visualEvidence?: Array<{
    id?: string;
    kind?: 'figure' | 'table' | string;
    label?: string;
    title?: string;
    caption?: string;
    imageUrl?: string | null;
    originalImageUrl?: string | null;
    tableData?: {
      headers?: string[];
      rows?: string[][];
    } | null;
    sourceUrl?: string | null;
    source?: string;
    routeRole?: string;
    supports?: string;
    readHint?: string;
    interpretation?: string;
    howProduced?: string;
    supportedClaim?: string;
    provenance?: Record<string, any>;
  }>;
  llmInsights?: {
    keyFindings?: Array<Record<string, any>>;
    researchGaps?: Array<Record<string, any>>;
    limitations?: Array<Record<string, any>>;
    figureAnalyses?: Array<Record<string, any>>;
    resourceLinks?: Array<Record<string, any>>;
  } | null;
  inferredLimitations?: Array<{
    id?: string;
    label: string;
    severity?: 'info' | 'warning' | 'error';
    detail: string;
    source?: string;
  }>;
}

export interface AdmissionResult {
  admitted: boolean;
  depth: 'deep' | 'structured' | 'light' | 'reject';
  primaryRole?: string;
  sourceRoles?: Record<string, number>;
  reasoning?: string;
}

export type ProjectDiagnosisStatus = 'ready' | 'missing' | 'limited' | 'pending';

export interface ProjectDiagnosisItem {
  key: string;
  label: string;
  status: ProjectDiagnosisStatus;
  value: string;
  detail: string;
}

export type ProjectReadinessStatus = 'ready' | 'review' | 'blocked' | 'processing';

export interface ProjectReadinessSummary {
  status: ProjectReadinessStatus;
  label: string;
  score: number;
  counts: Record<ProjectDiagnosisStatus, number>;
  blockers: string[];
  nextStep: string;
}

export type ProjectActionPriority = 'high' | 'normal' | 'low';
export type ProjectActionOperation = 'inspect' | 'reimport' | 'cancel' | 'wait';

export interface ProjectActionItem {
  id?: string;
  label: string;
  reason?: string;
  operation?: ProjectActionOperation;
  targetLayer: string | null;
  fallbackLayer?: string | null;
  priority?: ProjectActionPriority;
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
  project?: Project;
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
