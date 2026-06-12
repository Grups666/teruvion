'use client';

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import api from '../types/client';
import type { Entity, Project, SSEEvent, AnalysisProgress, EntityExploreResponse, RelatedEntity } from '../types/api';
import { getEntityLayer } from '../types/api';
import {
  formatSignalText,
  getEntityName,
  getEntityResearchBrief,
  getEntityReviewNotes,
  getEntitySignals,
  getEntityTakeaways
} from '../lib/entityView';
import {
  getDisplayLayer,
  getProjectDiagnosis,
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
import ResearchRouteGraph from '../components/ResearchRouteGraph';

const MapComponent = dynamic(() => import('../components/Map'), { ssr: false });

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
  const [activeCockpitKey, setActiveCockpitKey] = useState<string>('source');
  const [activeFocusIndex, setActiveFocusIndex] = useState(0);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (accessGranted) {
      loadData();
    }
  }, [accessGranted]);

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
      }
    }

    if (selectedProjectId) {
      loadProjectLenses(selectedProjectId);
    } else {
      setProjectLenses(null);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, projects]);

  useEffect(() => {
    if (selectedProjectId) {
      setActiveCockpitKey('source');
      setActiveFocusIndex(0);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    setActiveFocusIndex(0);
  }, [activeCockpitKey]);

  async function loadData() {
    try {
      const [pData, eData] = await Promise.all([
        api.getProjects(),
        api.getEntities()
      ]);
      setProjects(pData.projects || []);
      setEntities(eData.entities || []);
      setStatus((pData.projects?.length || 0) > 0 ? 'Updated' : 'Ready');
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

  async function handleAccessSubmit() {
    const code = accessCode.trim();
    if (!code) return;

    setCheckingAccess(true);
    setAccessError(null);
    try {
      const result = await api.verifyAccessCode(code);
      if (!result.valid) {
        setAccessError(result.error || 'Invalid invite code');
        return;
      }
      api.setAccessCode(code);
      setAccessGranted(true);
      setStatus('Access granted');
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Access check failed');
    } finally {
      setCheckingAccess(false);
    }
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
  const projectStats = getProjectStats(projectEntities);
  const projectQuality = selectedProject ? getProjectQuality(selectedProject, projectEntities) : null;
  const sourceCapsule = selectedProject ? getSourceCapsule(selectedProject, projectQuality) : null;
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
  const activeFocusItem = cockpitFocusItems[activeFocusIndex] || cockpitFocusItems[0] || null;
  const focusMicroGraph = buildFocusMicroGraph(activeFocusItem);
  const detailGraphPoints = buildConstellationPoints(cockpitFocusItems.length, 'detail');
  const focusGraphPoints = buildConstellationPoints(focusMicroGraph.length, 'micro');
  const selectedEntitySignals = selectedEntity ? getEntitySignals(selectedEntity, selectedExplore) : [];
  const selectedEntityReviewNotes = selectedEntity ? getEntityReviewNotes(selectedEntity, selectedExplore, selectedEntitySignals) : [];
  const selectedEntityTakeaways = selectedEntity ? getEntityTakeaways(selectedEntity, selectedExplore, selectedEntitySignals) : [];
  const selectedEntityBrief = selectedEntity
    ? getEntityResearchBrief(selectedEntity, selectedExplore, selectedEntitySignals, selectedEntityReviewNotes)
    : null;
  const projectDecomposition = selectedProject?.metadata?.decomposition;
  const projectSourceAttributes = ((projectDecomposition as any)?.sourceObject?.attributes || {}) as Record<string, any>;
  const projectResources = rankProjectResources(projectDecomposition?.externalResources || []).slice(0, 6);
  const projectLimitations = (projectDecomposition?.inferredLimitations || []).slice(0, 4);
  const projectAuthorLine = compactMetaList(
    projectDecomposition?.researchBrief?.authors
      || projectSourceAttributes.authors
      || projectSourceAttributes.author
      || projectSourceAttributes.creators
      || projectSourceAttributes.contributors
  );
  const projectVenueLine = compactMetaList(
    projectDecomposition?.researchBrief?.institutions
      || projectDecomposition?.researchBrief?.venue
      || projectSourceAttributes.institutions
      || projectSourceAttributes.affiliations
      || projectSourceAttributes.venue
      || projectSourceAttributes.publisher
      || projectSourceAttributes.journal
  );

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

  if (!accessGranted) {
    return (
      <main className="access-screen">
        <section className="access-panel">
          <div className="access-brand">
            <span>Teruvion</span>
            <small>Digital Earth Alpha</small>
          </div>
          <h1>Enter invite code</h1>
          <p>Teruvion is currently limited to invited alpha users.</p>
          <div className="access-form">
            <input
              value={accessCode}
              onChange={event => {
                setAccessCode(event.target.value);
                setAccessError(null);
              }}
              onKeyDown={event => event.key === 'Enter' && handleAccessSubmit()}
              placeholder="Invite code"
              autoComplete="one-time-code"
            />
            <button type="button" onClick={handleAccessSubmit} disabled={!accessCode.trim() || checkingAccess}>
              {checkingAccess ? 'Checking' : 'Enter'}
            </button>
          </div>
          {accessError && <div className="access-error">{accessError}</div>}
          <a className="access-apply" href="/alpha/apply">Request alpha access</a>
        </section>
      </main>
    );
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
                Import a DOI, paper title, or repository to build the first research graph.
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
                      <div className="project-name">{shortProjectName(project)}</div>
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
                  {sourceCapsule && isExternalUrl(sourceCapsule.source) ? (
                    <a className="project-panel-title project-panel-title-link" href={sourceCapsule.source!} target="_blank" rel="noreferrer">
                      {sourceCapsule.title}
                    </a>
                  ) : (
                    <div className="project-panel-title">{sourceCapsule?.title || selectedProject.name}</div>
                  )}
                  <div className="project-panel-subtitle">
                    {projectReadiness?.label || formatSignalText(selectedProject.analysis?.status || 'Project')}
                  </div>
                </div>
                <button className="project-panel-close" aria-label="Close project panel" onClick={() => setSelectedProjectId(null)}>
                  x
                </button>
              </div>

              {sourceCapsule && (
                <div className="source-capsule">
                  <div className="capsule-kicker">Source Capsule</div>
                  {isExternalUrl(sourceCapsule.source) ? (
                    <a className="capsule-title capsule-title-link" href={sourceCapsule.source!} target="_blank" rel="noreferrer">
                      {sourceCapsule.title}
                    </a>
                  ) : (
                    <div className="capsule-title">{sourceCapsule.title}</div>
                  )}
                  {(projectAuthorLine || projectVenueLine) && (
                    <div className="capsule-meta">
                      {projectAuthorLine && <span>{projectAuthorLine}</span>}
                      {projectVenueLine && <span>{projectVenueLine}</span>}
                    </div>
                  )}
                  <p className="capsule-brief">{sourceCapsule.brief}</p>
                  <div className="capsule-review-row">
                    {isExternalUrl(sourceCapsule.source) ? (
                      <a href={sourceCapsule.source!} target="_blank" rel="noreferrer">
                        Open original source
                      </a>
                    ) : (
                      <span>Original source not linked</span>
                    )}
                    <span>{sourceCapsule.reviewState}</span>
                  </div>
                </div>
              )}

              {cockpitSignals.length > 0 && (
                <div className="technical-route">
                  <div className="technical-route-head">
                    <span>Research Graph</span>
                    <span>Click a node to open its inner route</span>
                  </div>
                  <ResearchRouteGraph
                    signals={cockpitSignals}
                    activeKey={activeCockpitSignal?.key}
                    onSelect={key => {
                      const signal = cockpitSignals.find(item => item.key === key);
                      setActiveCockpitKey(key);
                      setStatus(`${signal?.label || 'Research'} graph node selected`);
                    }}
                  />
                </div>
              )}

              {activeCockpitSignal && (
                <div className={`route-drilldown ${activeCockpitSignal.status}`}>
                  <div className="route-drilldown-head">
                    <div>
                      <span>Inside Selected Node</span>
                      <strong>{activeCockpitSignal.label}</strong>
                    </div>
                    <em>{activeCockpitSignal.value}</em>
                  </div>
                  <p>{activeCockpitSignal.detail}</p>
                  {cockpitFocusItems.length > 0 && (
                    <div className="route-detail-graph">
                      <svg className="route-detail-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        {buildConstellationEdges(detailGraphPoints).map(edge => (
                          <line key={edge.id} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
                        ))}
                      </svg>
                      <div className="route-drilldown-path">
                        {cockpitFocusItems.map((item, index) => {
                          const point = detailGraphPoints[index] || { x: 50, y: 50 };
                          return (
                          <button
                            type="button"
                            className={`route-subnode ${activeFocusItem === item ? 'active' : ''}`}
                            key={`${activeCockpitSignal.key}-${item.label}`}
                            style={{ '--node-x': `${point.x}%`, '--node-y': `${point.y}%` } as React.CSSProperties}
                            onClick={() => {
                              setActiveFocusIndex(index);
                              setStatus(`${item.label} inner node selected`);
                            }}
                          >
                            <i>{index + 1}</i>
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                            <small>{item.detail}</small>
                          </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {activeFocusItem && (
                    <div className="route-focus-card">
                      <span>Focused Layer</span>
                      <strong>{activeFocusItem.value}</strong>
                      <p>{activeFocusItem.detail}</p>
                      {focusMicroGraph.length > 0 && (
                        <div className="route-micro-graph">
                          <svg className="route-micro-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                            {buildConstellationEdges(focusGraphPoints).map(edge => (
                              <line key={edge.id} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
                            ))}
                          </svg>
                          <div className="route-micro-nodes">
                            {focusMicroGraph.map((node, index) => {
                              const point = focusGraphPoints[index] || { x: 50, y: 50 };
                              return (
                              <div
                                className="route-micro-node"
                                key={node.label}
                                style={{ '--node-x': `${point.x}%`, '--node-y': `${point.y}%` } as React.CSSProperties}
                              >
                                <span>{node.label}</span>
                                <strong>{node.value}</strong>
                                <small>{node.detail}</small>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {projectBrief.length > 0 && (
                <div className="project-brief">
                  <div className="project-brief-head">
                    <span>Project Brief</span>
                    <span>{projectDecomposition?.researchBrief?.oneLine || projectReadiness?.nextStep || 'Review extracted source'}</span>
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

              {(projectResources.length > 0 || projectLimitations.length > 0) && (
                <div className="project-resources">
                  <div className="project-resources-column">
                    <div className="project-resources-head">
                      <span>Resource Investigation</span>
                      <small>{resourceSummary(projectResources)}</small>
                    </div>
                    <div className="project-resource-list">
                      {projectResources.length > 0 ? projectResources.map(resource => {
                        const signal = resourceSignal(resource);
                        return (
                          <a
                            href={normalizeExternalHref(resource.url)}
                            target="_blank"
                            rel="noreferrer"
                            className={`project-resource ${signal.level}`}
                            key={`${resource.type || 'resource'}-${resource.url}`}
                          >
                            <div className="resource-topline">
                              <span>{formatResourceType(resource.type)}</span>
                              <em>{signal.label}</em>
                            </div>
                            <strong>{resource.label || resourceHost(resource.url)}</strong>
                            <small>{resource.context || resource.role || resource.source || resourceHost(resource.url)}</small>
                            <div className="resource-foot">
                              <b>{resourceHost(resource.url)}</b>
                              {resource.source && <i>{formatResourceSource(resource.source)}</i>}
                            </div>
                          </a>
                        );
                      }) : (
                        <div className="project-resource empty">
                          <strong>No external resource detected</strong>
                          <small>Try a DOI, repository, data link, or richer source page.</small>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="project-resources-column">
                    <div className="project-resources-head">
                      <span>Limits</span>
                      <small>{projectLimitations.length > 0 ? 'Review before use' : 'No major limit'}</small>
                    </div>
                    <div className="project-limit-list">
                      {projectLimitations.length > 0 ? projectLimitations.map(limit => (
                        <div className={`project-limit ${limit.severity || 'info'}`} key={limit.id || limit.label}>
                          <span>{formatLimitationSource(limit.source)}</span>
                          <strong>{limit.label}</strong>
                          <small>{limit.detail}</small>
                        </div>
                      )) : (
                        <div className="project-limit info">
                          <strong>No protocol limitation reported</strong>
                          <small>Continue inspecting source evidence and route nodes.</small>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
                      {selectedEntityBrief?.role || selectedEntity.type}
                    </span>
                  </div>
                </div>
                <button className="detail-close" aria-label="Close details" onClick={() => setSelectedEntityId(null)}>
                  x
                </button>
              </div>

              <div className="detail-body">
                {selectedEntityBrief && (
                  <div className="detail-hero">
                    <div className="detail-hero-kicker">Research Detail</div>
                    <h2>{selectedEntityBrief.headline}</h2>
                    <div className="detail-hero-grid">
                      <div>
                        <span>Why it matters</span>
                        <p>{selectedEntityBrief.significance}</p>
                      </div>
                      <div>
                        <span>Evidence</span>
                        <p>{selectedEntityBrief.evidence}</p>
                      </div>
                      <div>
                        <span>Limitation</span>
                        <p>{selectedEntityBrief.limitation}</p>
                      </div>
                      <div>
                        <span>Next step</span>
                        <p>{selectedEntityBrief.nextStep}</p>
                      </div>
                    </div>
                    <div className="detail-hero-badges">
                      {selectedEntityBrief.badges.map(badge => (
                        <span className={badge.level} key={badge.label}>
                          <strong>{badge.value}</strong>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEntityTakeaways.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-label">Structured Reading</div>
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

                <div className="detail-section">
                  <div className="detail-label">Drilldown Path</div>
                  <EntityDrilldownView
                    selectedEntity={selectedEntity}
                    explore={selectedExplore}
                    loading={exploreLoading}
                    onSelectEntity={setSelectedEntityId}
                  />
                </div>

                {(selectedEntity.metadata?.confidence || selectedEntity.metadata?.source) && (
                  <div className="detail-section">
                    <div className="detail-label">Review Evidence</div>
                    <div className="detail-review-evidence">
                      {selectedEntity.metadata?.confidence && (
                        <div>
                          <span>Extraction confidence</span>
                          <strong>{(selectedEntity.metadata.confidence * 100).toFixed(0)}%</strong>
                          <p>Use this as a review signal, not as proof that the source claim is correct.</p>
                        </div>
                      )}
                      {selectedEntity.metadata?.source && (
                        <div>
                          <span>Source trace</span>
                          <strong>{sourceHost(String(selectedEntity.metadata.source))}</strong>
                          <p>{String(selectedEntity.metadata.source)}</p>
                        </div>
                      )}
                      {!selectedEntity.metadata?.source && (
                        <div>
                          <span>Source trace</span>
                          <strong>Not linked</strong>
                          <p>No external source is attached to this detail yet.</p>
                        </div>
                      )}
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

function EntityDrilldownView({
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
    return <div className="graph-empty">Loading drilldown...</div>;
  }

  const related = explore?.relatedEntities || [];
  const capabilities = explore?.capabilities || [];
  const sources = explore?.sources || [];

  if (related.length === 0 && capabilities.length === 0 && sources.length === 0) {
    return <div className="graph-empty">No deeper path is available yet.</div>;
  }

  return (
    <div className="graph-view">
      {related.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Related Details</div>
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
              Additional linked details are available in the graph.
            </div>
          )}
        </div>
      )}

      {capabilities.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Next Checks</div>
          <div className="action-list">
            {capabilities.slice(0, 6).map(action => (
              <span className="action-chip" key={action}>{action}</span>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Evidence Traces</div>
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

function isExternalUrl(value?: string | null) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function normalizeExternalHref(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^10\.\d{4,9}\//i.test(trimmed)) return `https://doi.org/${trimmed}`;
  return trimmed;
}

type ProjectResource = {
  label: string;
  url: string;
  type?: string;
  role?: string;
  source?: string;
  context?: string;
};

function rankProjectResources(resources: ProjectResource[]) {
  const seen = new Set<string>();
  return resources
    .filter(resource => {
      if (!resource?.url || seen.has(resource.url)) return false;
      seen.add(resource.url);
      return true;
    })
    .sort((a, b) => resourcePriority(b) - resourcePriority(a));
}

function resourcePriority(resource: ProjectResource) {
  const type = String(resource.type || '').toLowerCase();
  const priority: Record<string, number> = {
    repository: 90,
    code: 82,
    dataset: 80,
    supplement: 72,
    paper: 58,
    doi: 50,
    source: 45,
    external: 20
  };
  return priority[type] ?? 20;
}

function resourceSignal(resource: ProjectResource) {
  const priority = resourcePriority(resource);
  if (priority >= 80) return { label: 'High value', level: 'strong' };
  if (priority >= 58) return { label: 'Useful', level: 'normal' };
  return { label: 'Context', level: 'weak' };
}

function resourceSummary(resources: ProjectResource[]) {
  if (resources.length === 0) return 'No resource found';
  const hasData = resources.some(resource => ['dataset', 'repository', 'code'].includes(String(resource.type || '').toLowerCase()));
  if (hasData) return 'Data/code candidates found';
  return `${resources.length} references found`;
}

function formatResourceType(type?: string) {
  const labels: Record<string, string> = {
    repository: 'Code',
    code: 'Code',
    dataset: 'Data',
    supplement: 'Supplement',
    paper: 'Paper',
    doi: 'DOI',
    source: 'Source',
    external: 'External'
  };
  return labels[String(type || '').toLowerCase()] || 'External';
}

function formatResourceSource(source?: string) {
  return String(source || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatLimitationSource(source?: string) {
  if (source === 'llm-review') return 'LLM Review';
  if (source === 'protocol') return 'Protocol';
  return 'Review';
}

function buildFocusMicroGraph(item: {
  label: string;
  value: string;
  detail: string;
  children?: Array<{ label: string; value: string; detail?: string }>;
} | null) {
  if (!item) return [];
  if (Array.isArray(item.children) && item.children.length > 0) {
    return item.children.slice(0, 5).map(child => ({
      label: child.label,
      value: child.value,
      detail: child.detail || 'Protocol-derived detail from the selected route node.'
    }));
  }

  return [
    {
      label: 'Meaning',
      value: item.label,
      detail: item.value || 'This node summarizes the selected route layer.'
    },
    {
      label: 'Evidence',
      value: summarizeInline(item.detail, 64),
      detail: 'Use this as a review cue, not a hidden system object.'
    },
    {
      label: 'Next Check',
      value: 'Inspect confidence',
      detail: 'Follow the source, evidence, or linked resource before relying on this node.'
    }
  ];
}

function summarizeInline(value: string, limit: number) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function shortProjectName(project: Project) {
  const decomposition = project.metadata?.decomposition;
  const rawTitle = decomposition?.researchBrief?.title
    || decomposition?.sourceObject?.attributes?.title
    || decomposition?.sourceObject?.name
    || project.name;
  const cleaned = String(rawTitle || 'Untitled')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stopwords = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'for', 'and', 'to', 'with', 'using', 'global']);
  const words = cleaned.split(' ')
    .filter(word => word.length > 1 && !stopwords.has(word.toLowerCase()))
    .slice(0, 4);
  return words.length > 0 ? words.join(' ') : cleaned.split(' ').slice(0, 4).join(' ') || 'Untitled';
}

function buildConstellationPoints(count: number, variant: 'main' | 'detail' | 'micro') {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 50, y: 50 }];

  if (variant === 'main') {
    const layouts: Record<number, Array<{ x: number; y: number }>> = {
      2: [{ x: 28, y: 50 }, { x: 72, y: 50 }],
      3: [{ x: 22, y: 50 }, { x: 58, y: 28 }, { x: 78, y: 66 }],
      4: [{ x: 20, y: 46 }, { x: 48, y: 27 }, { x: 72, y: 45 }, { x: 55, y: 72 }],
      5: [{ x: 18, y: 47 }, { x: 46, y: 28 }, { x: 50, y: 70 }, { x: 76, y: 38 }, { x: 79, y: 66 }],
      6: [{ x: 17, y: 47 }, { x: 38, y: 27 }, { x: 58, y: 31 }, { x: 80, y: 45 }, { x: 69, y: 70 }, { x: 35, y: 72 }]
    };
    if (layouts[count]) return layouts[count];
  }

  const radiusByVariant = {
    main: 34,
    detail: 33,
    micro: 30
  };
  const centerYByVariant = {
    main: 50,
    detail: 51,
    micro: 50
  };
  const radius = radiusByVariant[variant];
  const center = { x: 50, y: centerYByVariant[variant] };
  const start = variant === 'main' ? -142 : -118;
  const sweep = variant === 'micro' ? 360 : 284;

  return Array.from({ length: count }, (_, index) => {
    const angle = count === 2
      ? start + index * 180
      : start + (sweep * index) / count;
    const radians = (angle * Math.PI) / 180;
    const yCompression = variant === 'main' ? 0.58 : 0.68;
    return {
      x: clampPercent(center.x + Math.cos(radians) * radius),
      y: clampPercent(center.y + Math.sin(radians) * radius * yCompression)
    };
  });
}

function buildConstellationEdges(points: Array<{ x: number; y: number }>) {
  if (points.length <= 1) return [];
  const center = { x: 50, y: 50 };
  const spokeEdges = points.map((point, index) => ({
    id: `spoke-${index}`,
    x1: center.x,
    y1: center.y,
    x2: point.x,
    y2: point.y
  }));
  const ringEdges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      id: `ring-${index}`,
      x1: point.x,
      y1: point.y,
      x2: next.x,
      y2: next.y
    };
  });
  return [...spokeEdges, ...ringEdges];
}

function clampPercent(value: number) {
  return Math.min(90, Math.max(10, Number(value.toFixed(2))));
}

function resourceHost(url: string) {
  try {
    return new URL(normalizeExternalHref(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function sourceHost(value: string) {
  if (!value) return 'Not linked';
  if (!/^https?:\/\//i.test(value)) return 'Recorded source';
  return resourceHost(value);
}

function compactMetaList(value: unknown) {
  if (!value) return '';
  const items = Array.isArray(value) ? value : [value];
  return items
    .map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const record = item as Record<string, any>;
        return record.name || record.displayName || record.title || record.label || '';
      }
      return String(item);
    })
    .filter(Boolean)
    .slice(0, 4)
    .join(', ');
}
