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
  const routeGraphPath = buildGraphPath(cockpitSignals.length, 'main');
  const detailGraphPath = buildGraphPath(cockpitFocusItems.length, 'detail');
  const focusGraphPath = buildGraphPath(focusMicroGraph.length, 'detail');
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

              {cockpitSignals.length > 0 && (
                <div className="technical-route">
                  <div className="technical-route-head">
                    <span>Research Graph</span>
                    <span>Click a node to open its inner route</span>
                  </div>
                  <div className="route-graph-canvas" style={{ '--node-count': cockpitSignals.length } as React.CSSProperties}>
                    <svg className="route-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <path d={routeGraphPath} />
                    </svg>
                    <div className="route-graph-nodes">
                      {cockpitSignals.map((signal, index) => (
                        <button
                          type="button"
                          key={signal.key}
                          className={`route-node ${signal.status} ${activeCockpitSignal?.key === signal.key ? 'active' : ''}`}
                          style={{ '--route-index': index } as React.CSSProperties}
                          onClick={() => {
                            setActiveCockpitKey(signal.key);
                            setStatus(`${signal.label} graph node selected`);
                          }}
                        >
                          <i aria-hidden="true" />
                          <span>{signal.label}</span>
                          <strong>{signal.value}</strong>
                          <small>{signal.detail}</small>
                        </button>
                      ))}
                    </div>
                  </div>
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
                    <div className="route-detail-graph" style={{ '--detail-count': cockpitFocusItems.length } as React.CSSProperties}>
                      <svg className="route-detail-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <path d={detailGraphPath} />
                      </svg>
                      <div className="route-drilldown-path">
                        {cockpitFocusItems.map((item, index) => (
                          <button
                            type="button"
                            className={`route-subnode ${activeFocusItem === item ? 'active' : ''}`}
                            key={`${activeCockpitSignal.key}-${item.label}`}
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
                        ))}
                      </div>
                    </div>
                  )}
                  {activeFocusItem && (
                    <div className="route-focus-card">
                      <span>Focused Layer</span>
                      <strong>{activeFocusItem.value}</strong>
                      <p>{activeFocusItem.detail}</p>
                      {focusMicroGraph.length > 0 && (
                        <div className="route-micro-graph" style={{ '--micro-count': focusMicroGraph.length } as React.CSSProperties}>
                          <svg className="route-micro-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                            <path d={focusGraphPath} />
                          </svg>
                          <div className="route-micro-nodes">
                            {focusMicroGraph.map(node => (
                              <div className="route-micro-node" key={node.label}>
                                <span>{node.label}</span>
                                <strong>{node.value}</strong>
                                <small>{node.detail}</small>
                              </div>
                            ))}
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

function buildFocusMicroGraph(item: { label: string; value: string; detail: string } | null) {
  if (!item) return [];
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

function buildGraphPath(count: number, variant: 'main' | 'detail') {
  if (count <= 1) return 'M 50 50';

  const left = variant === 'main' ? 8 : 7;
  const right = variant === 'main' ? 92 : 93;
  const usableWidth = right - left;
  const points = Array.from({ length: count }, (_, index) => {
    const x = left + (usableWidth * index) / Math.max(count - 1, 1);
    const y = variant === 'main'
      ? 50
      : index % 2 === 0 ? 42 : 58;
    return { x, y };
  });

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const midX = (previous.x + point.x) / 2;
    return `${path} C ${midX.toFixed(2)} ${previous.y.toFixed(2)}, ${midX.toFixed(2)} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`);
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
