'use client';

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import api from '../types/client';
import type { Entity, Project, SSEEvent, AnalysisProgress } from '../types/api';
import { getEntityLayer } from '../types/api';

const MapComponent = dynamic(() => import('../components/Map'), { ssr: false });

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [importInput, setImportInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('Ready');
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    return () => { unsubscribeRef.current?.(); };
  }, []);

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

  async function handleImport() {
    const input = importInput.trim();
    if (!input) return;

    setImporting(true);
    setStatus('Importing...');

    try {
      const result = await api.importSource(input);
      setImportInput('');

      // Add temporary project
      setProjects(prev => [...prev, {
        id: result.projectId,
        name: 'Importing...',
        entities: [],
        analysis: { status: 'importing' }
      }]);

      // Setup SSE for progress updates
      setupSSE(result.projectId);

    } catch (err: any) {
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
        // Handle status/progress events
        if (event.type === 'status' || event.type === 'progress') {
          const projectStatus = event.data.status;
          const phase = event.data.phase || event.data.currentPhase;

          // If completed, reload data
          if (projectStatus === 'completed') {
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
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
        </div>

        <div className="sidebar-body">
          {/* Projects */}
          <div className="section-header">
            <span className="section-title">Projects</span>
            {projects.length > 0 && (
              <button
                className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                onClick={clearAll}
                style={{ background: 'none', border: 'none', font: 'inherit' }}
              >
                Clear
              </button>
            )}
          </div>

          {projects.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
                Import a research source<br />to begin exploration
              </p>
            </div>
          ) : (
            <div className="project-list">
              {projects.map(project => {
                const isImporting = project.analysis?.status === 'importing';
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
                        <span className={`dot ${isImporting ? 'importing' : isReady ? 'ready' : ''}`} />
                        <span>{isImporting ? 'Analyzing' : isReady ? 'Ready' : 'Processing'}</span>
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

          {/* Entities for selected project */}
          {selectedProjectId && projectEntities.length > 0 && (
            <>
              <div className="section-header" style={{ marginTop: 24 }}>
                <span className="section-title">Objects</span>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{projectEntities.length}</span>
              </div>
              <div className="entity-list">
                {projectEntities.map(entity => (
                  <div
                    key={entity.id}
                    className={`entity-item ${selectedEntityId === entity.id ? 'active' : ''}`}
                    onClick={() => setSelectedEntityId(entity.id)}
                  >
                    <span className={`badge ${getEntityLayer(entity.type)}`}>
                      {entity.type}
                    </span>
                    <span style={{ fontSize: '13px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entity.attributes.name || entity.id}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <span style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.5px' }}>
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

        {/* ===== Detail Panel ===== */}
        <div className={`detail-panel ${selectedEntityId ? 'open' : ''}`}>
          {selectedEntity && (
            <>
              <div className="detail-header">
                <div>
                  <div className="detail-title">
                    {selectedEntity.attributes.name || 'Object'}
                  </div>
                  <div className="detail-subtitle">
                    <span className={`badge ${getEntityLayer(selectedEntity.type)}`}>
                      {selectedEntity.type}
                    </span>
                  </div>
                </div>
                <button className="detail-close" aria-label="Close details" onClick={() => setSelectedEntityId(null)}>
                  x
                </button>
              </div>

              <div className="detail-body">
                {/* Key Attributes */}
                <div className="detail-section">
                  <div className="detail-label">Properties</div>
                  <div className="detail-code">
                    {formatAttributes(selectedEntity)}
                  </div>
                </div>

                {/* Confidence */}
                {selectedEntity.metadata?.confidence && (
                  <div className="detail-section">
                    <div className="detail-label">Confidence</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        flex: 1,
                        height: 4,
                        background: 'var(--border)',
                        borderRadius: 2,
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${selectedEntity.metadata.confidence * 100}%`,
                          background: 'var(--primary)',
                          borderRadius: 2,
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      <span style={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                        {(selectedEntity.metadata.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Source */}
                {selectedEntity.metadata?.source && (
                  <div className="detail-section">
                    <div className="detail-label">Source</div>
                    <div className="detail-value" style={{ fontSize: '13px', color: 'var(--secondary)' }}>
                      {selectedEntity.metadata.source}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Empty state overlay when no entities */}
        {entities.length === 0 && (
          <div className="empty-state" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
            <div className="empty-icon" aria-hidden="true" />
            <div className="empty-title">No objects yet</div>
            <div className="empty-text">
              Import a research source to populate the Digital Earth graph
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/** Format entity attributes for display */
function formatAttributes(entity: Entity): string {
  const display: Record<string, any> = {};
  const skip = new Set(['name', 'id', 'type']);

  for (const [key, value] of Object.entries(entity.attributes)) {
    if (skip.has(key) || value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    display[key] = value;
  }

  return Object.keys(display).length > 0
    ? JSON.stringify(display, null, 2)
    : 'No additional properties';
}
