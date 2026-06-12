'use client';

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import api from '../types/client';
import type { Entity, Project, SSEEvent, AnalysisProgress, EntityExploreResponse, RelatedEntity } from '../types/api';
import { getEntityLayer } from '../types/api';
import {
  formatSignalText,
  getEntityName,
  getEntityReviewNotes,
  getEntitySignals,
  getEntityTakeaways
} from '../lib/entityView';
import {
  buildProjectSummaryText,
  getDisplayLayer,
  getObjectConstellation,
  getProjectDiagnosis,
  getProjectProgressSteps,
  getProjectQuality,
  getProjectReadiness,
  getProjectStats,
  getRecommendedNextActions,
  getSourceCapsule,
  type DisplayLayer
} from '../lib/projectView';
import {
  getCockpitFocusItems,
  getCockpitSignals,
  getLensSummaries,
  getProjectBrief
} from '../lib/projectCockpit';

const MapComponent = dynamic(() => import('../components/Map'), { ssr: false });

const DISPLAY_LAYER_ORDER: DisplayLayer[] = ['source', 'capability', 'world', 'foundation'];
const DISPLAY_LAYER_LABELS: Record<DisplayLayer, string> = {
  source: 'Sources',
  capability: 'Methods & Resources',
  world: 'Places & Events',
  foundation: 'Review Notes'
};

const EXAMPLE_SOURCES = [
  {
    label: 'DOI',
    value: '10.1038/s41586-024-07145-8'
  },
  {
    label: 'GitHub',
    value: 'https://github.com/Deltares/hydromt'
  },
  {
    label: 'Title',
    value: 'ERA5-Land: a state-of-the-art global reanalysis dataset for land applications'
  }
];

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [importInput, setImportInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');
  const [selectedExplore, setSelectedExplore] = useState<EntityExploreResponse | null>(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [projectLenses, setProjectLenses] = useState<Record<string, any> | null>(null);
  const [lensesLoading, setLensesLoading] = useState(false);
  const [activeCockpitKey, setActiveCockpitKey] = useState<string>('source');
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadExplore(entityId: string) {
      setExploreLoading(true);
      setSelectedExplore(null);

      try {
        const result = await api.exploreEntity(entityId);
        if (!cancelled) {
          setSelectedExplore(result);
        }
      } catch (err) {
        console.error('Failed to load entity graph:', err);
        if (!cancelled) {
          setSelectedExplore(null);
        }
      } finally {
        if (!cancelled) {
          setExploreLoading(false);
        }
      }
    }

    if (selectedEntityId) {
      loadExplore(selectedEntityId);
    } else {
      setSelectedExplore(null);
      setExploreLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedEntityId]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      clearProjectPoll();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectLenses(projectId: string) {
      setLensesLoading(true);
      setProjectLenses(null);

      try {
        const result = await api.getProjectLenses(projectId);
        if (!cancelled) {
          setProjectLenses(result);
        }
      } catch (err) {
        console.warn('Failed to load project lenses:', err);
        if (!cancelled) {
          setProjectLenses(null);
        }
      } finally {
        if (!cancelled) {
          setLensesLoading(false);
        }
      }
    }

    if (selectedProjectId) {
      loadProjectLenses(selectedProjectId);
    } else {
      setProjectLenses(null);
      setLensesLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, projects]);

  useEffect(() => {
    if (selectedProjectId) {
      setActiveCockpitKey('source');
    }
  }, [selectedProjectId]);

  async function loadData() {
    try {
      const [pData, eData] = await Promise.all([
        api.getProjects(),
        api.getEntities()
      ]);
      setProjects(pData.projects || []);
      setEntities(eData.entities || []);
      const count = pData.projects?.length || 0;
      setStatus(count > 0 ? `${count} project${count !== 1 ? 's' : ''}` : 'Ready');
    } catch (err) {
      console.error('Failed to load data:', err);
      setStatus('Error');
    }
  }

  function upsertProject(project: Project) {
    setProjects(prev => {
      const exists = prev.some(item => item.id === project.id);
      if (!exists) return [...prev, project];
      return prev.map(item => item.id === project.id ? { ...item, ...project } : item);
    });
  }

  async function handleImport() {
    const input = importInput.trim();
    if (!input) return;

    await submitImport(input, true);
  }

  async function submitImport(input: string, clearInput: boolean) {
    setImporting(true);
    setImportError(null);
    setStatus('Importing...');

    try {
      const result = await api.importSource(input);
      if (clearInput) {
        setImportInput('');
      }

      const importingProject = result.project || {
        id: result.projectId,
        name: 'Importing...',
        entities: [],
        analysis: { status: 'importing' }
      };

      upsertProject(importingProject);
      setSelectedProjectId(result.projectId);

      // Setup SSE for progress updates
      setupSSE(result.projectId);
      startProjectPoll(result.projectId);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setImportError(message);
      setStatus('Failed');
    } finally {
      setImporting(false);
    }
  }

  function setupSSE(projectId: string) {
    unsubscribeRef.current?.();

    unsubscribeRef.current = api.subscribeToProject(
      projectId,
      (event: SSEEvent) => {
        if (event.type === 'completed') {
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          clearProjectPoll();
          loadData();
          setStatus('Updated');
          return;
        }

        if (event.type === 'error') {
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          clearProjectPoll();
          setProjects(prev => prev.map(p => (
            p.id === projectId
              ? {
                  ...p,
                  analysis: {
                    ...p.analysis,
                    status: 'failed',
                    error: event.data.error,
                  }
                }
              : p
          )));
          setStatus('Import failed');
          return;
        }

        // Handle status/progress events
        if (event.type === 'status' || event.type === 'progress') {
          const projectStatus = event.data.status;
          const phase = event.data.phase || event.data.currentPhase;

          // If completed, reload data
          if (projectStatus === 'completed') {
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
            clearProjectPoll();
            loadData();
            return;
          }

          // Update project in list
          setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
              return {
                ...p,
                name: phase ? `Processing: ${phase}` : 'Importing...',
                analysis: {
                  ...p.analysis,
                  status: (projectStatus || 'importing') as AnalysisProgress['status'],
                  currentPhase: phase,
                }
              };
            }
            return p;
          }));
        }
      },
      // onError callback - reload data when SSE disconnects
      () => {
        console.log('[SSE] Disconnected, reloading data');
        loadData();
      }
    );
  }

  function clearProjectPoll() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function startProjectPoll(projectId: string) {
    clearProjectPoll();

    const poll = async () => {
      try {
        const { project } = await api.getProject(projectId);
        const projectStatus = project.analysis?.status;
        const currentPhase = project.analysis?.currentPhase || project.analysis?.progress?.inProgress;

        upsertProject(project);

        if (project.metadata?.decomposition || projectStatus === 'completed') {
          clearProjectPoll();
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          await loadData();
          setStatus('Updated');
          return;
        }

        if (projectStatus === 'failed') {
          clearProjectPoll();
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          await loadData();
          setStatus('Import failed');
          return;
        }

        if (currentPhase) {
          setStatus(`Processing: ${currentPhase}`);
        }
      } catch (err) {
        console.warn('[Import Poll] Failed to poll project:', err);
      }

      pollTimerRef.current = setTimeout(poll, 2000);
    };

    pollTimerRef.current = setTimeout(poll, 1500);
  }

  async function deleteProject(projectId: string) {
    if (!confirm('Delete this project?')) return;
    try {
      await api.deleteProject(projectId);
      if (selectedProjectId === projectId) setSelectedProjectId(null);
      loadData();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  async function clearAll() {
    if (!confirm('Delete all data?')) return;
    try {
      await api.clearAll();
      setSelectedProjectId(null);
      loadData();
    } catch (err) {
      console.error('Failed to clear:', err);
    }
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const projectEntities = selectedProject?.id
    ? entities.filter(e => e.metadata?.projectId === selectedProject.id)
    : [];
  const mapEntities = projectEntities.length > 0 ? projectEntities : entities;
  const selectedEntity = entities.find(e => e.id === selectedEntityId);
  const groupedProjectEntities = groupEntitiesByLayer(projectEntities);
  const projectStats = getProjectStats(projectEntities);
  const projectQuality = selectedProject ? getProjectQuality(selectedProject, projectEntities) : null;
  const projectProgressSteps = selectedProject ? getProjectProgressSteps(selectedProject) : [];
  const sourceCapsule = selectedProject ? getSourceCapsule(selectedProject, projectQuality) : null;
  const constellationNodes = getObjectConstellation(projectEntities);
  const projectDiagnosis = selectedProject ? getProjectDiagnosis(selectedProject, projectQuality, projectStats, projectEntities.length) : [];
  const projectReadiness = selectedProject ? getProjectReadiness(selectedProject, projectDiagnosis) : null;
  const recommendedActions = getRecommendedNextActions(selectedProject || null, projectQuality, projectStats, projectEntities.length);
  const lensSummaries = getLensSummaries(projectLenses);
  const projectBrief = selectedProject
    ? getProjectBrief({
        project: selectedProject,
        quality: projectQuality,
        readiness: projectReadiness,
        diagnosis: projectDiagnosis,
        lenses: lensSummaries,
        sourceCapsule
      })
    : [];
  const cockpitSignals = selectedProject
    ? getCockpitSignals({
        project: selectedProject,
        entities: projectEntities,
        stats: projectStats,
        readiness: projectReadiness,
        diagnosis: projectDiagnosis,
        lenses: lensSummaries,
        sourceCapsule
      })
    : [];
  const activeCockpitSignal = cockpitSignals.find(signal => signal.key === activeCockpitKey) || cockpitSignals[0] || null;
  const cockpitFocusItems = activeCockpitSignal && selectedProject
    ? getCockpitFocusItems({
        signal: activeCockpitSignal,
        project: selectedProject,
        stats: projectStats,
        quality: projectQuality,
        readiness: projectReadiness,
        diagnosis: projectDiagnosis,
        lenses: lensSummaries,
        sourceCapsule
      })
    : [];
  const selectedEntitySignals = selectedEntity ? getEntitySignals(selectedEntity, selectedExplore) : [];
  const selectedEntityReviewNotes = selectedEntity ? getEntityReviewNotes(selectedEntity, selectedExplore, selectedEntitySignals) : [];
  const selectedEntityTakeaways = selectedEntity ? getEntityTakeaways(selectedEntity, selectedExplore, selectedEntitySignals) : [];

  async function copyProjectSummary() {
    if (!selectedProject || !projectQuality) return;

    const summaryText = buildProjectSummaryText(
      selectedProject,
      projectQuality,
      projectStats,
      projectEntities.length
    );

    try {
      await navigator.clipboard.writeText(summaryText);
      setStatus('Project summary copied');
    } catch (err) {
      console.error('Failed to copy project summary:', err);
      setStatus('Copy failed');
    }
  }

  async function runProjectAction(action: { label: string; operation?: string; targetLayer: DisplayLayer | null; fallbackLayer?: DisplayLayer | null }) {
    if (action.operation === 'cancel') {
      if (!selectedProject?.id) return;
      try {
        const result = await api.cancelProjectImport(selectedProject.id);
        if (result.project) {
          upsertProject(result.project);
        }
        clearProjectPoll();
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        setStatus('Import cancelled');
      } catch (err) {
        console.error('Failed to cancel import:', err);
        setStatus('Cancel failed');
      }
      return;
    }

    if (action.operation === 'reimport') {
      const source = selectedProject?.metadata?.source;
      if (typeof source === 'string' && source.trim()) {
        await submitImport(source, false);
        return;
      }
      setStatus('No source available to restart');
      return;
    }

    selectActionTarget(action);
  }

  function selectActionTarget(action: { label: string; targetLayer: DisplayLayer | null; fallbackLayer?: DisplayLayer | null }) {
    const target = action.targetLayer
      ? projectEntities.find(entity => getDisplayLayer(entity) === action.targetLayer)
      : null;
    const fallback = !target && action.fallbackLayer
      ? projectEntities.find(entity => getDisplayLayer(entity) === action.fallbackLayer)
      : null;
    const anyEntity = !target && !fallback ? projectEntities[0] : null;
    const entity = target || fallback || anyEntity;

    if (entity) {
      setSelectedEntityId(entity.id);
    }

    setStatus(action.label);
  }

  return (
    <div className="app-shell">
      {/* ===== Sidebar ===== */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-name">Teruvion</span>
            <span className="brand-tagline">Digital Earth</span>
          </div>

          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="DOI, URL, or title..."
              value={importInput}
              onChange={e => setImportInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleImport()}
            />
            <button
              className="search-btn"
              onClick={handleImport}
              disabled={importing || !importInput.trim()}
            >
              {importing ? '...' : 'Go'}
            </button>
          </div>

          <div className="source-examples" aria-label="Example research sources">
            {EXAMPLE_SOURCES.map(example => (
              <button
                key={example.label}
                type="button"
                className="source-example"
                onClick={() => {
                  setImportInput(example.value);
                  setImportError(null);
                  setStatus(`${example.label} example selected`);
                }}
                disabled={importing}
                title={example.value}
              >
                {example.label}
              </button>
            ))}
          </div>

          {importError && (
            <div className="import-error" role="alert">
              <span>{importError}</span>
              <button type="button" onClick={() => setImportError(null)} aria-label="Dismiss import error">
                x
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-body">
          {/* Projects */}
          <div className="section-header">
            <span className="section-title">Projects</span>
            {projects.length > 0 && (
              <button
                onClick={clearAll}
                className="section-action"
              >
                Clear all
              </button>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="empty-projects">
              <p>
                Import a DOI, paper title, or repository to build the first object graph.
              </p>
            </div>
          ) : (
            <div className="project-list">
              {projects.map(project => {
                const isImporting = project.analysis?.status === 'importing';
                const isFailed = project.analysis?.status === 'failed';
                const isReady = !!project.metadata?.decomposition;

                return (
                  <div
                    key={project.id}
                    className={`project-card ${selectedProjectId === project.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setSelectedEntityId(null);
                    }}
                  >
                    <div className="project-info">
                      <div className="project-name">{project.name}</div>
                      <div className="project-status">
                        <span className={`dot ${isFailed ? 'failed' : isImporting ? 'importing' : isReady ? 'ready' : ''}`} />
                        <span>{isFailed ? 'Failed' : isImporting ? 'Analyzing' : isReady ? 'Ready' : 'Processing'}</span>
                      </div>
                    </div>
                    <button
                      className="project-delete"
                      aria-label={`Delete ${project.name}`}
                      onClick={e => { e.stopPropagation(); deleteProject(project.id); }}
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        <div className="sidebar-footer">
          <span className="sidebar-status">
            {status}
          </span>
        </div>
      </aside>

      {/* ===== Map ===== */}
      <main className="map-container">
        <MapComponent
          entities={mapEntities}
          selectedEntityId={selectedEntityId}
          onSelectEntity={setSelectedEntityId}
        />

        {/* ===== Project Object Panel ===== */}
        <div className={`project-panel ${selectedProjectId ? 'open' : ''}`}>
          {selectedProject && (
            <>
              <div className="project-panel-header">
                <div>
                  <div className="project-panel-title">{selectedProject.name}</div>
                  <div className="project-panel-subtitle">
                    {projectReadiness?.label || formatSignalText(selectedProject.analysis?.status || 'Project')}
                    {selectedProject.metadata?.admission?.depth ? ` - ${formatSignalText(selectedProject.metadata.admission.depth)}` : ''}
                  </div>
                </div>
                <button className="project-panel-close" aria-label="Close project panel" onClick={() => setSelectedProjectId(null)}>
                  x
                </button>
              </div>

              {sourceCapsule && (
                <div className="source-capsule">
                  <div className="capsule-kicker">Source Capsule</div>
                  <div className="capsule-title">{sourceCapsule.title}</div>
                  <div className="capsule-grid">
                    <span>
                      <strong>{sourceCapsule.type}</strong>
                      Type
                    </span>
                    <span>
                      <strong>{sourceCapsule.depth}</strong>
                      Depth
                    </span>
                    <span>
                      <strong>{sourceCapsule.extraction}</strong>
                      Extraction
                    </span>
                    <span>
                      <strong>{sourceCapsule.confidence}</strong>
                      Confidence
                    </span>
                  </div>
                  {sourceCapsule.source && (
                    <div className="capsule-source">{sourceCapsule.source}</div>
                  )}
                </div>
              )}

              <div className="decomposition-progress">
                {projectProgressSteps.map(step => (
                  <div className={`progress-step ${step.status}`} key={step.key}>
                    <span className="progress-marker" />
                    <span className="progress-copy">
                      <span>{step.label}</span>
                      <small>{step.detail}</small>
                    </span>
                  </div>
                ))}
              </div>

              {cockpitSignals.length > 0 && (
                <div className="research-cockpit">
                  <div className="cockpit-head">
                    <span>Research Cockpit</span>
                    <span>{projectReadiness?.label || 'Import state'}</span>
                  </div>
                  <div className="cockpit-grid">
                    {cockpitSignals.map(signal => (
                      <button
                        type="button"
                        key={signal.key}
                        className={`cockpit-card ${signal.status} ${activeCockpitSignal?.key === signal.key ? 'active' : ''}`}
                        data-has-target={signal.targetId ? 'true' : 'false'}
                        onClick={() => {
                          setActiveCockpitKey(signal.key);
                          if (signal.targetId) {
                            setSelectedEntityId(signal.targetId);
                            setStatus(`${signal.label} focus selected`);
                          }
                        }}
                      >
                        <span className="cockpit-label">{signal.label}</span>
                        <strong>{signal.value}</strong>
                        <small>{signal.detail}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeCockpitSignal && (
                <div className={`cockpit-focus ${activeCockpitSignal.status}`}>
                  <div className="cockpit-focus-head">
                    <span>{activeCockpitSignal.label} View</span>
                    <strong>{activeCockpitSignal.value}</strong>
                  </div>
                  <p>{activeCockpitSignal.detail}</p>
                  {cockpitFocusItems.length > 0 && (
                    <div className="cockpit-focus-grid">
                      {cockpitFocusItems.map(item => (
                        <div className="cockpit-focus-item" key={`${activeCockpitSignal.key}-${item.label}`}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                          <small>{item.detail}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {projectBrief.length > 0 && (
                <div className="project-brief">
                  <div className="project-brief-head">
                    <span>Project Brief</span>
                    <span>{projectReadiness?.nextStep || 'Review extracted source'}</span>
                  </div>
                  <div className="project-brief-grid">
                    {projectBrief.map(item => (
                      <div className={`brief-card ${item.status}`} key={item.key}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        <small>{item.detail}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projectQuality && (
                <div className="project-quality">
                  {projectReadiness && (
                    <div className={`readiness-strip ${projectReadiness.status}`}>
                      <div className="readiness-main">
                        <span>{projectReadiness.label}</span>
                        <strong>{projectReadiness.score}%</strong>
                      </div>
                      <div className="readiness-bar">
                        <span style={{ width: `${projectReadiness.score}%` }} />
                      </div>
                      <div className="readiness-next">{projectReadiness.nextStep}</div>
                    </div>
                  )}
                  <div className="quality-head">
                    <span className={`quality-pill ${projectQuality.level}`}>
                      {projectQuality.label}
                    </span>
                    <span className="quality-meta">
                      {projectQuality.method}
                      {projectQuality.relations > 0 ? ` - ${projectQuality.relations} relation${projectQuality.relations !== 1 ? 's' : ''}` : ''}
                    </span>
                  </div>
                  <div className="quality-summary">{projectQuality.summary}</div>
                  {projectQuality.coverage && (
                    <div className={`coverage-strip ${projectQuality.coverage.warning ? 'warning' : ''}`}>
                      <div className="coverage-main">
                        <span className="coverage-label">{projectQuality.coverage.label}</span>
                        <span className="coverage-detail">{projectQuality.coverage.detail}</span>
                      </div>
                      {projectQuality.coverage.metrics.length > 0 && (
                        <div className="coverage-metrics">
                          {projectQuality.coverage.metrics.map(metric => (
                            <span key={metric.label}>
                              <strong>{metric.value}</strong>
                              {metric.label}
                            </span>
                          ))}
                        </div>
                      )}
                      {projectQuality.coverage.warning && (
                        <div className="coverage-warning">{projectQuality.coverage.warning}</div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="quality-copy"
                    onClick={copyProjectSummary}
                  >
                    Copy summary
                  </button>
                  {projectQuality.notes.length > 0 && (
                    <div className="quality-notes">
                      {projectQuality.notes.slice(0, 5).map(note => (
                        <span className={note.level} key={note.text}>{note.text}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {projectDiagnosis.length > 0 && (
                <div className="import-diagnosis">
                  <div className="diagnosis-head">
                    <span>Import Diagnosis</span>
                    <span>{projectDiagnosis.filter(item => item.status === 'ready').length}/{projectDiagnosis.length} ready</span>
                  </div>
                  <div className="diagnosis-grid">
                    {projectDiagnosis.map(item => (
                      <div className={`diagnosis-card ${item.status}`} key={item.key}>
                        <div className="diagnosis-card-head">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                        <p>{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="object-constellation">
                <div className="constellation-head">
                  <span>Research Structure</span>
                  <span>Graph view</span>
                </div>
                {constellationNodes.length > 0 ? (
                  <div className="constellation-stage">
                    <div className="constellation-core">
                      <span>Core</span>
                      Source
                    </div>
                    {constellationNodes.map((node, index) => (
                      <button
                        type="button"
                        className={`constellation-node ${node.layer}`}
                        key={node.id}
                        style={{ '--node-index': index } as React.CSSProperties}
                        disabled={!node.sampleEntityId}
                        onClick={() => {
                          if (node.sampleEntityId) {
                            setSelectedEntityId(node.sampleEntityId);
                            setStatus(`${node.label} object selected`);
                          }
                        }}
                      >
                        <span>{DISPLAY_LAYER_LABELS[node.layer]}</span>
                        {node.type === 'world' ? 'Spatial context' : node.type === 'capability' ? 'Reusable knowledge' : node.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="constellation-empty">Object graph will appear after extraction.</div>
                )}
              </div>

              <div className="project-lenses">
                <div className="lens-head">
                  <span>Views</span>
                  <span>{lensesLoading ? 'Loading' : `${lensSummaries.length} view${lensSummaries.length !== 1 ? 's' : ''}`}</span>
                </div>
                {lensesLoading ? (
                  <div className="lens-empty">Building project views...</div>
                ) : lensSummaries.length > 0 ? (
                  <div className="lens-grid">
                    {lensSummaries.map(lens => (
                      <button
                        type="button"
                        className={`lens-card ${lens.status}`}
                        key={lens.name}
                        disabled={!lens.targetId}
                        onClick={() => {
                          if (lens.targetId) {
                            setSelectedEntityId(lens.targetId);
                            setStatus(`${lens.name} focus selected`);
                          }
                        }}
                      >
                        <div className="lens-name">{lens.name}</div>
                        <div className="lens-value">{lens.value}</div>
                        <div className="lens-detail">{lens.detail}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="lens-empty">No lens output yet.</div>
                )}
              </div>

              {recommendedActions.length > 0 && (
                <div className="next-actions">
                  <div className="next-actions-head">Next Actions</div>
                  <div className="next-action-list">
                    {recommendedActions.map(action => (
                      <button
                        type="button"
                        key={action.label}
                        className={[
                          action.priority === 'high' ? 'high' : '',
                          action.operation === 'wait' ? 'passive' : ''
                        ].filter(Boolean).join(' ')}
                        disabled={action.operation === 'wait'}
                        onClick={() => runProjectAction(action)}
                      >
                        <span>{action.label}</span>
                        {action.reason && <small>{action.reason}</small>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="object-groups">
                {projectEntities.length === 0 ? (
                  <div className="project-panel-empty">
                    {selectedProject.analysis?.status === 'failed'
                      ? selectedProject.analysis.error || 'Import failed'
                      : 'Objects will appear when the import completes.'}
                  </div>
                ) : (
                  DISPLAY_LAYER_ORDER.map(layer => {
                    const items = groupedProjectEntities[layer];
                    if (items.length === 0) return null;

                    return (
                      <div className="object-group" key={layer}>
                        <div className="object-group-header">
                          <span>{DISPLAY_LAYER_LABELS[layer]}</span>
                          <span>Inspect</span>
                        </div>
                        <div className="object-list">
                          {items.map(entity => (
                            <button
                              key={entity.id}
                              className={`object-row ${selectedEntityId === entity.id ? 'active' : ''}`}
                              onClick={() => setSelectedEntityId(entity.id)}
                            >
                              <span className={`object-dot ${getEntityLayer(entity)}`} />
                              <span className="object-main">
                                <span className="object-name">{getEntityName(entity)}</span>
                                <span className="object-type">{entity.type}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* ===== Detail Panel ===== */}
        <div className={`detail-panel ${selectedEntityId ? 'open' : ''}`}>
          {selectedEntity && (
            <>
              <div className="detail-header">
                <div>
                  <div className="detail-title">
                    {getEntityName(selectedEntity)}
                  </div>
                  <div className="detail-subtitle">
                    <span className={`badge ${getEntityLayer(selectedEntity)}`}>
                      {selectedEntity.type}
                    </span>
                  </div>
                </div>
                <button className="detail-close" aria-label="Close details" onClick={() => setSelectedEntityId(null)}>
                  x
                </button>
              </div>

              <div className="detail-body">
                {selectedEntityTakeaways.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-label">Key Takeaways</div>
                    <div className="takeaway-list">
                      {selectedEntityTakeaways.map(item => (
                        <div className="takeaway-card" key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                          <p>{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEntitySignals.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-label">Review Signals</div>
                    <div className="signal-grid">
                      {selectedEntitySignals.map(signal => (
                        <div className={`signal-card ${signal.level}`} key={signal.label}>
                          <div className="signal-label">{signal.label}</div>
                          <div className="signal-value">{signal.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEntityReviewNotes.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-label">Known Limits</div>
                    <div className="review-notes">
                      {selectedEntityReviewNotes.map(note => (
                        <div className={`review-note ${note.level}`} key={note.text}>
                          {note.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Research Graph */}
                <div className="detail-section">
                  <div className="detail-label">Research Graph</div>
                  <EntityGraphView
                    selectedEntity={selectedEntity}
                    explore={selectedExplore}
                    loading={exploreLoading}
                    onSelectEntity={setSelectedEntityId}
                  />
                </div>

                {/* Confidence */}
                {selectedEntity.metadata?.confidence && (
                  <div className="detail-section">
                    <div className="detail-label">Confidence</div>
                    <div className="confidence-meter">
                      <div className="confidence-track">
                        <div
                          className="confidence-fill"
                          style={{ width: `${selectedEntity.metadata.confidence * 100}%` }}
                        />
                      </div>
                      <span className="confidence-value">
                        {(selectedEntity.metadata.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Source */}
                {selectedEntity.metadata?.source && (
                  <div className="detail-section">
                    <div className="detail-label">Source</div>
                    <div className="detail-value detail-source">
                      {selectedEntity.metadata.source}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function EntityGraphView({
  selectedEntity,
  explore,
  loading,
  onSelectEntity
}: {
  selectedEntity: Entity;
  explore: EntityExploreResponse | null;
  loading: boolean;
  onSelectEntity: (id: string) => void;
}) {
  if (loading) {
    return <div className="graph-empty">Loading graph...</div>;
  }

  const related = explore?.relatedEntities || [];
  const capabilities = explore?.capabilities || [];
  const sources = explore?.sources || [];

  if (related.length === 0 && capabilities.length === 0 && sources.length === 0) {
    return <div className="graph-empty">No graph connections found yet.</div>;
  }

  return (
    <div className="graph-view">
      {related.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Connections</div>
          <div className="relation-list">
            {related.slice(0, 12).map(item => (
              <RelationRow
                key={`${item.direction}-${item.relation}-${item.id}`}
                item={item}
                selectedEntity={selectedEntity}
                onSelectEntity={onSelectEntity}
              />
            ))}
          </div>
          {related.length > 12 && (
            <div className="graph-more">
              {related.length - 12} more connection{related.length - 12 !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {capabilities.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Suggested Checks</div>
          <div className="action-list">
            {capabilities.slice(0, 6).map(action => (
              <span className="action-chip" key={action}>{action}</span>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Sources</div>
          <div className="source-list">
            {sources.slice(0, 4).map(source => (
              <div className="source-item" key={source}>{source}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RelationRow({
  item,
  selectedEntity,
  onSelectEntity
}: {
  item: RelatedEntity;
  selectedEntity: Entity;
  onSelectEntity: (id: string) => void;
}) {
  const selectedName = getEntityName(selectedEntity);
  const left = item.direction === 'outgoing' ? selectedName : item.name;
  const right = item.direction === 'outgoing' ? item.name : selectedName;
  const confidence = typeof item.confidence === 'number' ? `${Math.round(item.confidence * 100)}%` : null;
  const provenanceLabel = getRelationProvenanceLabel(item.provenance);
  const verification = item.verificationState ? formatSignalText(item.verificationState) : null;

  return (
    <button className="relation-row" onClick={() => onSelectEntity(item.id)}>
      <span className={`object-dot ${getEntityLayer(item)}`} />
      <span className="relation-main">
        <span className="relation-line">
          <span className="relation-node">{left}</span>
          <span className="relation-predicate">{item.relation}</span>
          <span className="relation-node">{right}</span>
        </span>
        <span className="relation-type">{item.type}</span>
        {(confidence || verification || provenanceLabel || item.isFallback) && (
          <span className="relation-evidence">
            {confidence && <span>{confidence}</span>}
            {verification && <span>{verification}</span>}
            {provenanceLabel && <span>{provenanceLabel}</span>}
            {item.isFallback && <span className="warning">Fallback</span>}
          </span>
        )}
      </span>
    </button>
  );
}

function getRelationProvenanceLabel(provenance?: Record<string, any>) {
  if (!provenance) return null;
  const raw = provenance.section || provenance.source || provenance.matchType || provenance.provider || provenance.type;
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

function groupEntitiesByLayer(entities: Entity[]) {
  const groups: Record<DisplayLayer, Entity[]> = {
    source: [],
    capability: [],
    world: [],
    foundation: [],
  };

  for (const entity of entities) {
    groups[getDisplayLayer(entity)].push(entity);
  }

  return groups;
}
