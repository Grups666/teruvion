'use client';

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import api from '../types/client';
import type {
  Entity,
  Project,
  ProjectRecomposition,
  SSEEvent,
  AnalysisProgress,
  EntityExploreResponse,
  RelatedEntity
} from '../types/api';
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
  getLensSummaries
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
  const [activeVisualIndex, setActiveVisualIndex] = useState(0);
  const [expandedVisualIndex, setExpandedVisualIndex] = useState<number | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('teruvionAccessToken');
    if (savedToken) {
      api.setAccessCode(savedToken);
      setAccessGranted(true);
      setStatus('Access restored');
    }
  }, []);

  useEffect(() => {
    if (accessGranted) {
      loadData();
    }
  }, [accessGranted]);

  useEffect(() => {
    setActiveVisualIndex(0);
    setExpandedVisualIndex(null);
  }, [selectedProjectId]);

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
    setActiveFocusIndex(0);
  }, [activeCockpitKey, selectedProjectId]);

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
      if (err instanceof Error && err.message.toLowerCase().includes('unauthorized')) {
        api.setAccessCode(null);
        sessionStorage.removeItem('teruvionAccessToken');
        sessionStorage.removeItem('teruvionAccessTokenExpiresAt');
        setAccessGranted(false);
        setAccessError('This session is no longer active. Enter your invite code again.');
      }
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
      const accessToken = result.accessToken || code;
      api.setAccessCode(accessToken);
      sessionStorage.setItem('teruvionAccessToken', accessToken);
      if (result.accessTokenExpiresAt) {
        sessionStorage.setItem('teruvionAccessTokenExpiresAt', result.accessTokenExpiresAt);
      }
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
  const projectDiagnosis = selectedProject ? getProjectDiagnosis(selectedProject, projectQuality, projectStats) : [];
  const projectReadiness = selectedProject ? getProjectReadiness(selectedProject, projectDiagnosis) : null;
  const lensSummaries = getLensSummaries(projectLenses);
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
  const detailGraphSignals = cockpitFocusItems.map((item, index) => ({
    key: `${activeCockpitSignal?.key || 'detail'}-${index}`,
    label: item.label,
    value: item.value,
    detail: item.detail,
    status: 'ready' as const
  }));
  const activeDetailGraphKey = activeFocusItem
    ? `${activeCockpitSignal?.key || 'detail'}-${Math.max(0, cockpitFocusItems.indexOf(activeFocusItem))}`
    : null;
  const focusGraphSignals = focusMicroGraph.map((node, index) => ({
    key: `${activeDetailGraphKey || 'focus'}-${index}`,
    label: node.label,
    value: node.value,
    detail: node.detail,
    status: 'review' as const
  }));
  const selectedEntitySignals = selectedEntity ? getEntitySignals(selectedEntity, selectedExplore) : [];
  const selectedEntityReviewNotes = selectedEntity ? getEntityReviewNotes(selectedEntity, selectedExplore, selectedEntitySignals) : [];
  const selectedEntityTakeaways = selectedEntity ? getEntityTakeaways(selectedEntity, selectedExplore, selectedEntitySignals) : [];
  const selectedEntityBrief = selectedEntity
    ? getEntityResearchBrief(selectedEntity, selectedExplore, selectedEntitySignals, selectedEntityReviewNotes)
    : null;
  const projectDecomposition = selectedProject?.metadata?.decomposition;
  const projectRecomposition = selectedProject?.metadata?.projectRecomposition as ProjectRecomposition | undefined;
  const projectSourceAttributes = ((projectDecomposition as any)?.sourceObject?.attributes || {}) as Record<string, any>;
  const projectResources = rankProjectResources(getProjectResourceItems(projectRecomposition, projectDecomposition)).slice(0, 8);
  const projectVisualEvidence = rankProjectVisualEvidence(getProjectVisualEvidenceItems(projectRecomposition, projectDecomposition)).slice(0, 8);
  const activeVisualEvidence = projectVisualEvidence[Math.min(activeVisualIndex, Math.max(0, projectVisualEvidence.length - 1))] || null;
  const expandedVisualEvidence = expandedVisualIndex !== null ? projectVisualEvidence[expandedVisualIndex] || null : null;
  const projectLimitations = rankProjectLimitations(getProjectLimitationItems(projectRecomposition, projectDecomposition)).slice(0, 4);
  const projectHighlights = getProjectHighlights(projectRecomposition, projectDecomposition, sourceCapsule);
  const projectIntegritySignals = getProjectIntegritySignals(projectDecomposition);
  const recommendedActions = mergeRecommendedActions(
    buildResourceNextActions(projectResources),
    getRecommendedNextActions(selectedProject || null, projectQuality, projectStats)
  );
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

  async function runProjectAction(action: { label: string; operation?: string; targetLayer: DisplayLayer | null; fallbackLayer?: DisplayLayer | null; href?: string }) {
    if (action.operation === 'open-resource' && action.href) {
      window.open(normalizeExternalHref(action.href), '_blank', 'noopener,noreferrer');
      return;
    }

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

              <div className="project-overview">
                {sourceCapsule && (
                  <section className="source-capsule">
                    <div className="capsule-kicker">Source Brief</div>
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
                  </section>
                )}

                <section className="project-highlights">
                  <div className="project-highlights-block">
                    <div className="project-highlights-head">Highlights</div>
                    <div className="project-highlight-list">
                      {projectHighlights.map(item => (
                        <div className="project-highlight" key={item.key}>
                          <strong>{item.value}</strong>
                          {item.detail && <small>{item.detail}</small>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {projectLimitations.length > 0 && (
                    <div className="project-highlights-block">
                      <div className="project-highlights-head">Research Gaps</div>
                      <div className="research-gap-list">
                        {projectLimitations.slice(0, 3).map(limit => (
                          <div className={`research-gap ${limit.severity || 'info'}`} key={limit.id || limit.label}>
                            <strong>{limit.label}</strong>
                            <small>{limit.detail}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>

              {projectIntegritySignals.length > 0 && (
                <div className="extraction-integrity-strip" aria-label="Extraction integrity">
                  {projectIntegritySignals.map(signal => (
                    <div className={`extraction-integrity-signal ${signal.level}`} key={signal.key}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                      <small>{signal.detail}</small>
                    </div>
                  ))}
                </div>
              )}

              {cockpitSignals.length > 0 && (
                <div className="technical-route">
                  <div className="technical-route-head">
                    <span>Research Graph</span>
                    <span>Open a node to inspect its inner route</span>
                  </div>
                  <ResearchRouteGraph
                    signals={cockpitSignals}
                    activeKey={activeCockpitSignal?.key}
                    onSelect={key => {
                      const signal = cockpitSignals.find(item => item.key === key);
                      setActiveCockpitKey(key);
                      setActiveFocusIndex(0);
                      setStatus(`${signal?.label || 'Research'} graph node selected`);
                    }}
                  />
                </div>
              )}

              {activeCockpitSignal && (
                <div className={`route-drilldown ${activeCockpitSignal.status}`}>
                  <div className="route-drilldown-head">
                    <div>
                      <span>Selected Step</span>
                      <strong>{activeCockpitSignal.label}</strong>
                    </div>
                    <em>{activeCockpitSignal.value}</em>
                  </div>
                  <p>{activeCockpitSignal.detail}</p>
                  {cockpitFocusItems.length > 0 && (
                    <ResearchRouteGraph
                      signals={detailGraphSignals}
                      activeKey={activeDetailGraphKey}
                      variant="detail"
                      onSelect={key => {
                        const index = detailGraphSignals.findIndex(signal => signal.key === key);
                        if (index >= 0) {
                          setActiveFocusIndex(index);
                          setStatus(`${detailGraphSignals[index].label} inner node selected`);
                        }
                      }}
                    />
                  )}
                  {activeFocusItem && (
                    <div className="route-focus-card">
                      <span>Inner Route</span>
                      <strong>{activeFocusItem.value}</strong>
                      <p>{activeFocusItem.detail}</p>
                      {focusMicroGraph.length > 0 && (
                        <ResearchRouteGraph
                          signals={focusGraphSignals}
                          activeKey={focusGraphSignals[0]?.key}
                          variant="micro"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeVisualEvidence && (
                <div className="visual-evidence">
                  <div className="visual-evidence-head">
                    <div>
                      <span>Visual Evidence</span>
                      <strong>{visualEvidenceSummary(projectVisualEvidence)}</strong>
                    </div>
                    <div className="visual-evidence-controls">
                      <small>{Math.min(activeVisualIndex + 1, projectVisualEvidence.length)} / {projectVisualEvidence.length}</small>
                    </div>
                  </div>
                  <div className="visual-carousel-card">
                    <div className="visual-preview-wrap">
                      <button
                        type="button"
                        className="visual-nav visual-nav-prev"
                        onClick={() => setActiveVisualIndex(index => (index - 1 + projectVisualEvidence.length) % projectVisualEvidence.length)}
                        aria-label="Previous figure"
                      >
                        <span aria-hidden="true">‹</span>
                      </button>
                      {isTableVisual(activeVisualEvidence) ? (
                        <div
                          className="visual-preview visual-table-preview"
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedVisualIndex(activeVisualIndex)}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') setExpandedVisualIndex(activeVisualIndex);
                          }}
                          aria-label="Open table preview"
                        >
                          <VisualTable visual={activeVisualEvidence} />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="visual-preview"
                          onClick={() => setExpandedVisualIndex(activeVisualIndex)}
                          disabled={!activeVisualEvidence.imageUrl}
                          aria-label="Open figure preview"
                        >
                          {activeVisualEvidence.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={activeVisualEvidence.imageUrl} alt={activeVisualEvidence.label || activeVisualEvidence.title || 'Source figure'} loading="lazy" />
                          ) : (
                            <span>No image preview</span>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        className="visual-nav visual-nav-next"
                        onClick={() => setActiveVisualIndex(index => (index + 1) % projectVisualEvidence.length)}
                        aria-label="Next figure"
                      >
                        <span aria-hidden="true">›</span>
                      </button>
                    </div>
                    <div className="visual-narrative">
                      <div className="visual-card-topline">
                        <span>{formatVisualKind(activeVisualEvidence.kind)}</span>
                        <em>{activeVisualEvidence.routeRole || 'Source evidence'}</em>
                      </div>
                      <strong>{activeVisualEvidence.label || activeVisualEvidence.title || 'Source visual'}</strong>
                      <p>{activeVisualEvidence.caption || activeVisualEvidence.supports || 'Caption unavailable.'}</p>
                      {(activeVisualEvidence.interpretation || activeVisualEvidence.howProduced || activeVisualEvidence.supportedClaim) && (
                        <div className="visual-interpretation">
                          {activeVisualEvidence.interpretation && <span>{activeVisualEvidence.interpretation}</span>}
                          {activeVisualEvidence.howProduced && <span>{activeVisualEvidence.howProduced}</span>}
                          {activeVisualEvidence.supportedClaim && <span>{activeVisualEvidence.supportedClaim}</span>}
                        </div>
                      )}
                      <small>{activeVisualEvidence.readHint || activeVisualEvidence.supports || 'Verify this visual against the original source.'}</small>
                    </div>
                  </div>
                </div>
              )}

              {projectResources.length > 0 && (
                <div className="project-resources">
                  <div className="project-resources-column">
                    <div className="project-resources-head">
                      <span>Resource Investigation</span>
                      <small>{resourceSummary(projectResources)}</small>
                    </div>
                    <div className="project-resource-list">
                      {projectResources.length > 0 ? projectResources.map(resource => {
                        const signal = resourceSignal(resource);
                        const resourceUrl = String(resource.url || '');
                        return (
                          <a
                            href={normalizeExternalHref(resourceUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className={`project-resource ${signal.level}`}
                            key={`${resource.type || 'resource'}-${resourceUrl}`}
                          >
                            <span>{formatResourceType(resource.type)}</span>
                            <strong>{resource.label || resourceHost(resourceUrl)}</strong>
                            <small>{resourceReviewText(resource)}</small>
                            <em>{resourceHost(resourceUrl)}</em>
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

        {expandedVisualEvidence && (
          <div className="visual-modal" role="dialog" aria-modal="true">
            <button className="visual-modal-backdrop" type="button" onClick={() => setExpandedVisualIndex(null)} aria-label="Close figure preview" />
            <div className="visual-modal-panel">
              <button className="visual-modal-close" type="button" onClick={() => setExpandedVisualIndex(null)} aria-label="Close figure preview">
                x
              </button>
              {isTableVisual(expandedVisualEvidence) ? (
                <div className="visual-modal-table">
                  <VisualTable visual={expandedVisualEvidence} />
                </div>
              ) : expandedVisualEvidence.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={expandedVisualEvidence.imageUrl} alt={expandedVisualEvidence.label || 'Expanded source figure'} />
              )}
              <div className="visual-modal-caption">
                <span>{expandedVisualEvidence.label || formatVisualKind(expandedVisualEvidence.kind)}</span>
                <p>{expandedVisualEvidence.caption || expandedVisualEvidence.supports}</p>
                {(expandedVisualEvidence.interpretation || expandedVisualEvidence.howProduced || expandedVisualEvidence.supportedClaim) && (
                  <small>
                    {[expandedVisualEvidence.interpretation, expandedVisualEvidence.howProduced, expandedVisualEvidence.supportedClaim]
                      .filter(Boolean)
                      .join(' ')}
                  </small>
                )}
              </div>
            </div>
          </div>
        )}

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
                    <div className="detail-label">Reliability</div>
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
                    <div className="detail-label">Review Notes</div>
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
                  <div className="detail-label">Evidence Path</div>
                  <EntityDrilldownView
                    selectedEntity={selectedEntity}
                    explore={selectedExplore}
                    loading={exploreLoading}
                    onSelectEntity={setSelectedEntityId}
                  />
                </div>

                {(selectedEntity.metadata?.confidence || selectedEntity.metadata?.source) && (
                  <div className="detail-section">
                    <div className="detail-label">Source Check</div>
                    <div className="detail-review-evidence">
                      {selectedEntity.metadata?.confidence && (
                        <div>
                          <span>Review confidence</span>
                          <strong>{(selectedEntity.metadata.confidence * 100).toFixed(0)}%</strong>
                          <p>Use this as a review signal, not as proof that the source claim is correct.</p>
                        </div>
                      )}
                      {selectedEntity.metadata?.source && (
                        <div>
                          <span>Original source</span>
                          <strong>{sourceHost(String(selectedEntity.metadata.source))}</strong>
                          <p>
                            <a href={String(selectedEntity.metadata.source)} target="_blank" rel="noreferrer">
                              Open linked evidence
                            </a>
                          </p>
                        </div>
                      )}
                      {!selectedEntity.metadata?.source && (
                        <div>
                          <span>Original source</span>
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
    return <div className="graph-empty">Loading deeper evidence...</div>;
  }

  const related = explore?.relatedEntities || [];
  const capabilities = explore?.capabilities || [];
  const sources = explore?.sources || [];

  if (related.length === 0 && capabilities.length === 0 && sources.length === 0) {
    return <div className="graph-empty">No deeper evidence path is available yet.</div>;
  }

  return (
    <div className="graph-view">
      {related.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Linked Reasoning</div>
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
              Additional links are available for deeper review.
            </div>
          )}
        </div>
      )}

      {capabilities.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Review Checks</div>
          <div className="action-list">
            {capabilities.slice(0, 6).map(action => (
              <span className="action-chip" key={action}>{action}</span>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="graph-block">
          <div className="graph-block-title">Source Traces</div>
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
        {(confidence || verification || provenanceLabel || item.isFallback) && (
          <span className="relation-evidence">
            {confidence && <span>{confidence} confidence</span>}
            {verification && <span>{verification} review</span>}
            {provenanceLabel && <span>{provenanceLabel}</span>}
            {item.isFallback && <span className="warning">Inferred link</span>}
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
  label?: string;
  url?: string | null;
  type?: string;
  role?: string;
  source?: string;
  context?: string;
  investigationLabel?: string;
  routeRelevance?: string;
  verificationFocus?: string;
  reproducibilityGrade?: string;
  reviewHint?: string;
  linked?: boolean;
};

type ProjectVisualEvidence = {
  id?: string;
  kind?: string;
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
};

function isTableVisual(visual?: ProjectVisualEvidence | null) {
  return String(visual?.kind || '').toLowerCase() === 'table';
}

function VisualTable({ visual }: { visual: ProjectVisualEvidence }) {
  const headers = Array.isArray(visual.tableData?.headers) ? visual.tableData?.headers || [] : [];
  const rows = Array.isArray(visual.tableData?.rows) ? visual.tableData?.rows || [] : [];
  const maxColumns = Math.max(headers.length, ...rows.map(row => row.length), 0);

  if (rows.length === 0 && visual.imageUrl) {
    return (
      <div className="visual-table-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={visual.imageUrl} alt={visual.label || 'Source table'} loading="lazy" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="visual-table-empty">
        <strong>{visual.label || 'Table'}</strong>
        <span>{visual.caption || 'Structured table data was not available from this source.'}</span>
      </div>
    );
  }

  return (
    <div className="visual-table-scroll" aria-label={visual.label || 'Source table'}>
      <table>
        {headers.length > 0 && (
          <thead>
            <tr>
              {Array.from({ length: maxColumns }).map((_, index) => (
                <th key={`head-${index}`}>{headers[index] || ''}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {Array.from({ length: maxColumns }).map((_, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`}>{row[cellIndex] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ProjectAction = {
  label: string;
  reason?: string;
  priority?: 'high' | 'normal' | 'low';
  operation?: string;
  targetLayer: DisplayLayer | null;
  fallbackLayer?: DisplayLayer | null;
  href?: string;
};

function rankProjectVisualEvidence(items: ProjectVisualEvidence[]) {
  const seen = new Set<string>();
  const rolePriority: Record<string, number> = {
    'Evaluation evidence': 90,
    'Method structure': 84,
    'Input evidence': 78,
    'Result evidence': 74,
    'Tabular evidence': 64,
    'Visual evidence': 60
  };

  return items
    .filter(item => {
      const key = `${item.kind || 'visual'}:${item.label || item.title || item.caption}`;
      if (!item?.caption || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const byRole = (rolePriority[b.routeRole || ''] || 0) - (rolePriority[a.routeRole || ''] || 0);
      if (byRole !== 0) return byRole;
      return String(a.label || '').localeCompare(String(b.label || ''));
    });
}

function visualEvidenceSummary(items: ProjectVisualEvidence[]) {
  const figureCount = items.filter(item => String(item.kind || '').toLowerCase() !== 'table').length;
  const tableCount = items.length - figureCount;
  const parts = [];
  if (figureCount) parts.push(`${figureCount} figures`);
  if (tableCount) parts.push(`${tableCount} tables`);
  return parts.length > 0 ? parts.join(' / ') : `${items.length} visual evidence items`;
}

type ProjectHighlight = {
  key: string;
  value: string;
  detail: string;
};

type ProjectIntegritySignal = {
  key: string;
  label: string;
  value: string;
  detail: string;
  level: 'ready' | 'review' | 'warning';
};

function getProjectResourceItems(
  recomposition: ProjectRecomposition | undefined,
  decomposition: any
): ProjectResource[] {
  const recomposed = recomposition?.aggregate?.resources?.items || [];
  if (recomposed.length > 0) return recomposed as ProjectResource[];
  return decomposition?.externalResources || [];
}

function getProjectVisualEvidenceItems(
  recomposition: ProjectRecomposition | undefined,
  decomposition: any
): ProjectVisualEvidence[] {
  const recomposed = recomposition?.aggregate?.visualEvidence?.items || [];
  if (recomposed.length > 0) return recomposed as ProjectVisualEvidence[];
  return decomposition?.visualEvidence || [];
}

function getProjectLimitationItems(
  recomposition: ProjectRecomposition | undefined,
  decomposition: any
): ProjectLimitation[] {
  const recomposed = recomposition?.aggregate?.limitations || [];
  if (recomposed.length > 0) return recomposed as ProjectLimitation[];
  return [
    ...(decomposition?.llmInsights?.researchGaps || []).map((item: any) => ({ ...item, kind: 'research_gap' })),
    ...(decomposition?.llmInsights?.limitations || []).map((item: any) => ({ ...item, kind: 'limitation' })),
    ...(decomposition?.inferredLimitations || [])
  ];
}

function getProjectHighlights(
  recomposition: ProjectRecomposition | undefined,
  decomposition: any,
  sourceCapsule: ReturnType<typeof getSourceCapsule> | null
): ProjectHighlight[] {
  const keyPoints = recomposition?.aggregate?.brief?.keyPoints?.length
    ? recomposition.aggregate.brief.keyPoints
    : decomposition?.researchBrief?.keyPoints || [];
  const mapped = keyPoints
    .filter((item: any) => item?.value && !isLowMeaningHighlight(item))
    .slice(0, 4)
    .map((item: any, index: number) => ({
      key: item.id || `highlight-${index}`,
      value: cleanHighlightText(item.value),
      detail: cleanHighlightText(item.detail || item.sourceTitle || item.label || '')
    }));

  if (mapped.length > 0) return mapped;

  const oneLine = recomposition?.aggregate?.brief?.oneLine
    || decomposition?.researchBrief?.oneLine
    || sourceCapsule?.brief;
  return [
    {
      key: 'source-summary',
      value: cleanHighlightText(oneLine || 'Source imported for review'),
      detail: 'Use the graph, figures, and links below to verify the extracted route.'
    }
  ];
}

function isLowMeaningHighlight(item: any) {
  const text = `${item.label || ''} ${item.value || ''}`.toLowerCase();
  return [
    'core route',
    'input / context',
    'input/context',
    'source brief',
    'extraction confidence',
    'review state'
  ].some(token => text.includes(token));
}

function cleanHighlightText(value: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^abstract\s+/i, '')
    .trim();
}

function getProjectIntegritySignals(decomposition: any): ProjectIntegritySignal[] {
  if (!decomposition) return [];

  const integrity = decomposition.extractionIntegrity || {};
  const routeQuality = integrity.routeQuality || decomposition.workflowOutline?.provenance?.routeQuality || {};
  const graphTraceability = integrity.graphTraceability || {};
  const contentFidelity = integrity.contentFidelity || {};
  const briefQuality = integrity.briefQuality || {};
  const visualEvidenceQuality = integrity.visualEvidenceQuality || {};
  const resourceGraphQuality = integrity.resourceGraphQuality || {};
  const evidenceSummary = decomposition.evidenceGraph?.summary || integrity.evidenceGraph || {};
  const resourceSummary = decomposition.resourceGraph?.summary || integrity.resourceGraph || {};
  const issues = Array.isArray(integrity.issues) ? integrity.issues : [];
  const warningCount = issues.filter((issue: any) => issue?.severity === 'warning').length;

  const signals: ProjectIntegritySignal[] = [];
  if (routeQuality.level || routeQuality.contentNodeCount !== undefined) {
    signals.push({
      key: 'route',
      label: 'Route',
      value: formatSignalText(routeQuality.level || 'review'),
      detail: `${routeQuality.contentNodeCount || 0} nodes / ${routeQuality.edgeCount || 0} links`,
      level: routeQuality.level === 'content' ? 'ready' : 'review'
    });
  }

  if (graphTraceability.level || graphTraceability.score !== undefined) {
    const untraced = graphTraceability.untracedNodeCount || 0;
    const weak = graphTraceability.weakNodeCount || 0;
    const detail = untraced > 0
      ? `${untraced} untraced nodes`
      : weak > 0
        ? `${weak} weakly traced nodes`
        : `${graphTraceability.traceableNodeCount || 0}/${graphTraceability.routeNodeCount || 0} nodes traced`;
    signals.push({
      key: 'trace',
      label: 'Trace',
      value: graphTraceability.score !== undefined ? `${graphTraceability.score}%` : formatSignalText(graphTraceability.level || 'review'),
      detail,
      level: graphTraceability.level === 'traceable'
        ? 'ready'
        : graphTraceability.level === 'weak'
          ? 'warning'
          : 'review'
    });
  }

  if (contentFidelity.level || contentFidelity.score !== undefined) {
    const missing = Array.isArray(contentFidelity.missingFacets)
      ? contentFidelity.missingFacets.join(', ')
      : '';
    const ungrounded = Array.isArray(contentFidelity.grounding?.ungroundedFacets)
      ? contentFidelity.grounding.ungroundedFacets.join(', ')
      : '';
    const weakGrounding = Array.isArray(contentFidelity.grounding?.weaklyGroundedFacets)
      ? contentFidelity.grounding.weaklyGroundedFacets.join(', ')
      : '';
    const detail = missing
      ? `Missing ${missing}`
      : ungrounded
        ? `Ungrounded ${ungrounded}`
        : weakGrounding
          ? `Weak support ${weakGrounding}`
          : `${(contentFidelity.coveredFacets || []).length || 0} facets covered`;
    signals.push({
      key: 'fidelity',
      label: 'Fidelity',
      value: contentFidelity.score !== undefined ? `${contentFidelity.score}%` : formatSignalText(contentFidelity.level || 'review'),
      detail,
      level: contentFidelity.level === 'content'
        ? 'ready'
        : contentFidelity.level === 'weak'
          ? 'warning'
          : 'review'
    });
  }

  if (briefQuality.level || briefQuality.pointCount !== undefined) {
    const reasons = Array.isArray(briefQuality.reasons) ? briefQuality.reasons : [];
    signals.push({
      key: 'brief',
      label: 'Brief',
      value: briefQuality.informationScore !== undefined
        ? `${briefQuality.informationScore}%`
        : formatSignalText(briefQuality.level || 'review'),
      detail: reasons[0] || `${briefQuality.groundedPointCount || 0}/${briefQuality.pointCount || 0} points grounded`,
      level: briefQuality.level === 'complete'
        ? 'ready'
        : briefQuality.level === 'weak' || briefQuality.level === 'missing'
          ? 'warning'
          : 'review'
    });
  }

  if (visualEvidenceQuality.level || visualEvidenceQuality.visualCount !== undefined) {
    const reasons = Array.isArray(visualEvidenceQuality.reasons) ? visualEvidenceQuality.reasons : [];
    signals.push({
      key: 'visuals',
      label: 'Visuals',
      value: visualEvidenceQuality.visualCount !== undefined
        ? `${visualEvidenceQuality.explainedCount || 0}/${visualEvidenceQuality.visualCount || 0} explained`
        : formatSignalText(visualEvidenceQuality.level || 'review'),
      detail: reasons[0] || `${visualEvidenceQuality.expectedCount || 0} expected figures/tables`,
      level: visualEvidenceQuality.level === 'complete' || visualEvidenceQuality.level === 'not_applicable'
        ? 'ready'
        : visualEvidenceQuality.level === 'weak' || visualEvidenceQuality.level === 'missing'
          ? 'warning'
          : 'review'
    });
  }

  if (evidenceSummary.claimCount !== undefined || evidenceSummary.visualCount !== undefined) {
    signals.push({
      key: 'evidence',
      label: 'Evidence',
      value: `${evidenceSummary.linkedClaimCount || 0}/${evidenceSummary.claimCount || 0} linked`,
      detail: `${evidenceSummary.visualCount || 0} visuals / ${evidenceSummary.resourceCount || 0} resources`,
      level: (evidenceSummary.claimCount || 0) === 0 || (evidenceSummary.linkedClaimCount || 0) > 0 ? 'ready' : 'review'
    });
  }

  if (resourceGraphQuality.level || resourceGraphQuality.resourceCount !== undefined) {
    const reasons = Array.isArray(resourceGraphQuality.reasons) ? resourceGraphQuality.reasons : [];
    signals.push({
      key: 'resources',
      label: 'Resources',
      value: resourceGraphQuality.resourceCount !== undefined
        ? `${resourceGraphQuality.linkedResourceCount || 0}/${resourceGraphQuality.resourceCount || 0} linked`
        : formatSignalText(resourceGraphQuality.level || 'review'),
      detail: reasons[0] || `${resourceGraphQuality.reusableResourceCount || 0} reusable resources`,
      level: resourceGraphQuality.level === 'complete' || resourceGraphQuality.level === 'not_applicable'
        ? 'ready'
        : resourceGraphQuality.level === 'weak'
          ? 'warning'
          : 'review'
    });
  } else if (resourceSummary.resourceCount !== undefined) {
    signals.push({
      key: 'resources',
      label: 'Resources',
      value: `${resourceSummary.reusableResourceCount || 0} reusable`,
      detail: `${resourceSummary.linkedResourceCount || 0}/${resourceSummary.resourceCount || 0} linked`,
      level: (resourceSummary.resourceCount || 0) === 0 || (resourceSummary.linkedResourceCount || 0) > 0 ? 'ready' : 'review'
    });
  }

  const integritySignal = {
    key: 'warnings',
    label: 'Integrity',
    value: warningCount > 0 ? `${warningCount} warnings` : 'Checked',
    detail: issues[0]?.detail || 'Schema, provenance, scope, and graph signals reviewed.',
    level: warningCount > 0 ? 'warning' : 'ready'
  } as ProjectIntegritySignal;

  if (warningCount > 0) {
    return [integritySignal, ...signals].slice(0, 7);
  }

  signals.push(integritySignal);

  return signals.slice(0, 7);
}

function formatVisualKind(kind?: string) {
  const value = String(kind || 'figure').toLowerCase();
  return value === 'table' ? 'Table' : 'Figure';
}

function rankProjectResources(resources: ProjectResource[]) {
  const seen = new Set<string>();
  return resources
    .filter(resource => {
      const url = String(resource?.url || '').trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .sort((a, b) => resourcePriority(b) - resourcePriority(a));
}

function buildResourceNextActions(resources: ProjectResource[]): ProjectAction[] {
  return resources
    .filter(resource => resource?.url && resourcePriority(resource) >= 50)
    .slice(0, 2)
    .map(resource => ({
      label: resourceActionLabel(resource),
      reason: resource.verificationFocus
        ? `Check ${resource.verificationFocus}.`
        : resource.routeRelevance || resource.reviewHint || `Open ${resourceHost(String(resource.url || ''))} to verify its role.`,
      priority: resourcePriority(resource) >= 80 ? 'high' : 'normal',
      operation: 'open-resource',
      targetLayer: null,
      href: resource.url || undefined
    }));
}

function mergeRecommendedActions(resourceActions: ProjectAction[], fallbackActions: ProjectAction[]): ProjectAction[] {
  const merged = [...resourceActions, ...fallbackActions];
  const seen = new Set<string>();
  return merged.filter(action => {
    const key = `${action.label}:${action.href || action.targetLayer || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function resourceActionLabel(resource: ProjectResource) {
  const type = String(resource.type || '').toLowerCase();
  if (resource.reproducibilityGrade && (type === 'repository' || type === 'code')) {
    return `Review static grade ${resource.reproducibilityGrade.toUpperCase()} code`;
  }
  if (resource.investigationLabel) return resource.investigationLabel;
  if (type === 'repository' || type === 'code') return 'Inspect code path';
  if (type === 'dataset') return 'Verify data source';
  if (type === 'supplement') return 'Inspect supplement';
  if (type === 'paper' || type === 'doi' || type === 'source') return 'Open source evidence';
  return 'Review linked resource';
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
  if (resource.reproducibilityGrade) {
    const grade = resource.reproducibilityGrade.toUpperCase();
    return {
      label: `Static grade ${grade}`,
      level: ['A', 'B'].includes(grade) ? 'strong' : grade === 'C' ? 'normal' : 'weak'
    };
  }
  if (resource.investigationLabel) {
    return { label: resource.investigationLabel, level: resourcePriority(resource) >= 80 ? 'strong' : 'normal' };
  }
  const priority = resourcePriority(resource);
  if (priority >= 80) return { label: 'Reproducibility lead', level: 'strong' };
  if (priority >= 58) return { label: 'Evidence lead', level: 'normal' };
  return { label: 'Context lead', level: 'weak' };
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

function resourceReviewText(resource: ProjectResource) {
  return resource.routeRelevance
    || resource.reviewHint
    || resource.context
    || resource.role
    || 'Open this link to verify how it supports the research route.';
}

function formatLimitationSource(source?: string) {
  if (source === 'llm-review') return 'Model Review';
  if (source === 'protocol') return 'System Check';
  return 'Review';
}

type ProjectLimitation = {
  id?: string;
  label: string;
  severity?: 'info' | 'warning' | 'error';
  detail: string;
  source?: string;
};

function rankProjectLimitations(limitations: ProjectLimitation[]) {
  const priority: Record<string, number> = {
    error: 30,
    warning: 20,
    info: 10
  };
  return [...limitations].sort((a, b) => {
    const severityDiff = (priority[b.severity || 'info'] || 0) - (priority[a.severity || 'info'] || 0);
    if (severityDiff !== 0) return severityDiff;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
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
      detail: child.detail || 'Detail from the selected route node.'
    }));
  }

  return [
    {
      label: 'Meaning',
      value: item.label,
      detail: item.value || 'This node summarizes part of the source route.'
    },
    {
      label: 'Evidence',
      value: summarizeInline(item.detail, 64),
      detail: 'Use this as a review cue before relying on the interpretation.'
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
