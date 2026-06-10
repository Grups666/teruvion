// ============================================================================
// STATE
// ============================================================================

const state = {
  map: null,
  projects: [],
  entities: [],
  selectedProject: null,
  understanding: null,
  markers: []
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  initMap();
  loadData();
  attachEventListeners();
}

function initMap() {
  const maxBounds = [[-85, -Infinity], [85, Infinity]];

  state.map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 10,
    worldCopyJump: false,
    maxBounds: maxBounds,
    maxBoundsViscosity: 1.0
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    noWrap: false
  }).addTo(state.map);
}

function attachEventListeners() {
  document.getElementById('import-btn').onclick = doImport;
  document.getElementById('import-input').onkeydown = e => {
    if (e.key === 'Enter') doImport();
  };
  document.getElementById('rp-close').onclick = closePanel;
  document.getElementById('clear-btn').onclick = clearAll;

  // Close panel when clicking map
  document.getElementById('map').addEventListener('click', (e) => {
    if (document.getElementById('research-panel').classList.contains('open')) {
      closePanel();
    }
  });
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadData() {
  const [pRes, eRes] = await Promise.all([
    fetch('/api/projects'),
    fetch('/api/entities')
  ]);

  state.projects = (await pRes.json()).projects || [];
  state.entities = (await eRes.json()).entities || [];

  renderProjects();
  renderMarkers();
  setStatus(`${state.projects.length} project${state.projects.length !== 1 ? 's' : ''}`);
}

// ============================================================================
// PROJECT LIST
// ============================================================================

function renderProjects() {
  const el = document.getElementById('project-list');

  if (!state.projects.length) {
    el.innerHTML = '<div class="empty"><p>Import a research paper or<br>repository to begin.</p></div>';
    return;
  }

  el.innerHTML = state.projects.map(p => {
    const isAnalyzing = p.analysis?.status === 'analyzing';
    const metaText = isAnalyzing
      ? '<span style="color: var(--green);">●</span> Analyzing...'
      : `${p.entities.length} objects`;

    return `
      <div class="project-item ${state.selectedProject === p.id ? 'active' : ''}"
           data-id="${p.id}" data-project-id="${p.id}">
        <div class="project-name">${esc(p.name.substring(0, 60))}</div>
        <div class="project-meta">${metaText}</div>
        <button class="project-delete" data-project-id="${p.id}" title="Delete project">×</button>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.project-item').forEach(item => {
    item.onclick = (e) => {
      if (e.target.classList.contains('project-delete')) return;
      openProject(item.dataset.id);
    };
  });

  el.querySelectorAll('.project-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      deleteProject(btn.dataset.projectId);
    };
  });
}

// ============================================================================
// PROJECT DETAIL PANEL
// ============================================================================

async function openProject(projectId) {
  state.selectedProject = projectId;
  renderProjects();

  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;

  const panel = document.getElementById('research-panel');
  const body = document.getElementById('rp-body');
  panel.classList.add('open');

  // Close previous SSE connection
  if (window.activeEventSource) {
    window.activeEventSource.close();
    window.activeEventSource = null;
  }

  // Check if analyzing
  const statusRes = await fetch(`/api/projects/${projectId}/status`);
  const statusData = await statusRes.json();

  if (statusData.analysis.status === 'analyzing') {
    renderAnalysisProgress(statusData);
    setupSSE(projectId);
    return;
  }

  // Load completed understanding
  body.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading research understanding...</p></div>';

  try {
    const res = await fetch(`/api/research/understanding/${projectId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.understanding) {
      throw new Error('No understanding data');
    }

    state.understanding = data.understanding;
    renderResearchPanel(project, data.understanding);
  } catch (err) {
    console.error('Failed to load understanding:', err);
    body.innerHTML = `<div class="empty"><p>Failed to load research understanding: ${err.message}</p></div>`;
  }
}

function closePanel() {
  document.getElementById('research-panel').classList.remove('open');
  state.selectedProject = null;
  renderProjects();

  if (window.activeEventSource) {
    window.activeEventSource.close();
    window.activeEventSource = null;
  }

  if (window.elapsedTimer) {
    clearInterval(window.elapsedTimer);
    window.elapsedTimer = null;
  }
}

// ============================================================================
// SSE FOR REAL-TIME UPDATES
// ============================================================================

function setupSSE(projectId) {
  const eventSource = new EventSource(`/api/projects/${projectId}/events`);
  window.activeEventSource = eventSource;

  eventSource.onmessage = async (event) => {
    if (state.selectedProject !== projectId) {
      eventSource.close();
      window.activeEventSource = null;
      if (window.elapsedTimer) {
        clearInterval(window.elapsedTimer);
        window.elapsedTimer = null;
      }
      return;
    }

    const { type, data } = JSON.parse(event.data);

    if (type === 'overview') {
      // Update project name from overview
      const project = state.projects.find(p => p.id === projectId);
      if (project && data.name) {
        project.name = data.name;
      }
      renderProjects();

      // Refresh progress display
      const res = await fetch(`/api/projects/${projectId}/status`);
      const statusData = await res.json();
      renderAnalysisProgress(statusData);
    } else if (type === 'status' || type === 'completed') {
      const res = await fetch(`/api/projects/${projectId}/status`);
      const statusData = await res.json();

      if (data.status !== 'analyzing' || type === 'completed') {
        eventSource.close();
        window.activeEventSource = null;
        if (window.elapsedTimer) {
          clearInterval(window.elapsedTimer);
          window.elapsedTimer = null;
        }

        // Reload projects to update analyzing status
        await loadData();

        if (state.selectedProject === projectId) {
          openProject(projectId);
        }
      } else {
        renderAnalysisProgress(statusData);
      }
    }
  };

  eventSource.onerror = (err) => {
    console.error('[SSE] Connection error:', err);
    eventSource.close();
    window.activeEventSource = null;
  };
}

// ============================================================================
// ANALYSIS PROGRESS RENDERING
// ============================================================================

function renderAnalysisProgress(data) {
  const body = document.getElementById('rp-body');
  document.getElementById('rp-title').textContent = data.name || 'Analyzing...';

  const { analysis } = data;
  const totalPhases = analysis.completed.length + analysis.pending.length + (analysis.inProgress ? 1 : 0);
  const progress = Math.round((analysis.completed.length / totalPhases) * 100);

  const startedAt = new Date(analysis.startedAt).getTime();
  const formatElapsed = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  let html = `
    <div style="padding: 24px;">
      <div style="margin-bottom: 24px;">
        <div style="font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 8px;">
          ${analysis.status === 'analyzing' ? '🔄 Analyzing Research' : '⏸️ Analysis Paused'}
        </div>
        <div style="font-size: 14px; color: #64748b;">
          Deep understanding in progress...
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-size: 13px; color: #64748b;">Progress</span>
          <span style="font-size: 13px; font-weight: 600; color: #2563eb;">${progress}%</span>
        </div>
        <div style="height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; background: #2563eb; width: ${progress}%; transition: width 0.3s;"></div>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">
          Current Phase
        </div>
        <div style="padding: 12px; background: #3b82f608; border: 1px solid #3b82f620; border-radius: 6px;">
          <div style="font-size: 14px; color: #2563eb; font-weight: 500;">
            ${analysis.inProgress || analysis.currentPhase || 'Processing...'}
          </div>
          ${analysis.details[analysis.inProgress] ? `
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
              ${JSON.stringify(analysis.details[analysis.inProgress])}
            </div>
          ` : ''}
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">
          Completed (${analysis.completed.length})
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${analysis.completed.map(p => `
            <div style="padding: 6px 12px; background: #22c55e10; border: 1px solid #22c55e30; border-radius: 4px; font-size: 12px; color: #16a34a;">
              ✓ ${p}
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">
          Pending (${analysis.pending.length})
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${analysis.pending.map(p => `
            <div style="padding: 6px 12px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #64748b;">
              ${p}
            </div>
          `).join('')}
        </div>
      </div>

      ${data.entities.total > 0 ? `
        <div style="margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">
            Extracted So Far
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div style="padding: 12px; background: #f8fafc; border-radius: 6px;">
              <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${data.entities.total}</div>
              <div style="font-size: 11px; color: #64748b;">Total Objects</div>
            </div>
            <div style="padding: 12px; background: #f8fafc; border-radius: 6px;">
              <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${data.entities.datasets}</div>
              <div style="font-size: 11px; color: #64748b;">Datasets</div>
            </div>
            <div style="padding: 12px; background: #f8fafc; border-radius: 6px;">
              <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${data.entities.regions}</div>
              <div style="font-size: 11px; color: #64748b;">Regions</div>
            </div>
          </div>
        </div>
      ` : ''}

      <div style="display: flex; gap: 12px;">
        <button onclick="cancelAnalysis('${data.projectId}')" style="flex: 1; padding: 10px; background: #ef444420; color: #dc2626; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
          Cancel Analysis
        </button>
        <button onclick="closePanel()" style="flex: 1; padding: 10px; background: #f1f5f9; color: #475569; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
          Close
        </button>
      </div>

      <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 11px; color: #64748b;">
        Started: ${new Date(analysis.startedAt).toLocaleTimeString()}<br>
        Elapsed: <span id="elapsed-timer" data-started="${startedAt}">0:00</span>
      </div>
    </div>
  `;

  body.innerHTML = html;

  // Start elapsed timer
  if (window.elapsedTimer) {
    clearInterval(window.elapsedTimer);
  }

  window.elapsedTimer = setInterval(() => {
    const timerEl = document.getElementById('elapsed-timer');
    if (!timerEl) {
      clearInterval(window.elapsedTimer);
      window.elapsedTimer = null;
      return;
    }
    const startTime = parseInt(timerEl.dataset.started);
    const nowElapsed = Math.floor((Date.now() - startTime) / 1000);
    timerEl.textContent = formatElapsed(nowElapsed);
  }, 1000);

  const nowElapsed = Math.floor((Date.now() - startedAt) / 1000);
  document.getElementById('elapsed-timer').textContent = formatElapsed(nowElapsed);
}

// ============================================================================
// RESEARCH PANEL RENDERING
// ============================================================================

function renderResearchPanel(project, understanding) {
  const u = understanding;
  const overview = u.overview || {};
  const methods = u.methods?.methods || [];
  const datasets = u.datasets?.datasets || [];
  const experiments = u.experiments?.experiments || [];
  const results = u.results?.detailedResults || [];
  const reproducibility = u.reproducibility || {};
  const spatial = u.spatial || {};

  // 统一使用project.name，保证左侧列表和详情面板一致
  document.getElementById('rp-title').textContent = project.name;

  let html = '';

  // Worth Reading
  if (overview.worthReading) {
    html += `<div class="rp-section">
      <div class="rp-label">Worth Reading?</div>
      <div class="rp-text">${esc(overview.worthReading)}</div>
    </div>`;
  }

  // Problem
  if (overview.problem) {
    html += `<div class="rp-section">
      <div class="rp-label">Problem</div>
      <div class="rp-text">${esc(overview.problem)}</div>
    </div>`;
  }

  // Contribution
  if (overview.contribution) {
    html += `<div class="rp-section">
      <div class="rp-label">Contribution</div>
      <div class="rp-text">${esc(overview.contribution)}</div>
    </div>`;
  }

  // Methods
  if (methods.length > 0) {
    html += `<div class="rp-section">
      <div class="rp-label">Methods (${methods.length})</div>
      <ul class="rp-list">
        ${methods.map(m => `<li><strong>${esc(m.name)}</strong>: ${esc(m.innovation || m.architecture?.description || '')}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Datasets
  if (datasets.length > 0) {
    html += `<div class="rp-section">
      <div class="rp-label">Datasets (${datasets.length})</div>
      <ul class="rp-list">
        ${datasets.map(d => `<li><strong>${esc(d.name)}</strong> ${d.spatial?.coverage ? `(${esc(d.spatial.coverage)})` : ''}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Experiments
  if (experiments.length > 0) {
    html += `<div class="rp-section">
      <div class="rp-label">Experiments (${experiments.length})</div>
      <ul class="rp-list">
        ${experiments.map(e => `<li>${esc(e.name)}: ${esc(e.purpose || '')}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Results
  if (results.length > 0) {
    html += `<div class="rp-section">
      <div class="rp-label">Key Results</div>
      <ul class="rp-list">
        ${results.slice(0, 5).map(r => `<li>${esc(r.setting)}: ${esc(r.metric)} = ${esc(r.value)}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Spatial
  if (spatial.hasSpatialDimension && spatial.regions && spatial.regions.length > 0) {
    html += `<div class="rp-section">
      <div class="rp-label">Study Regions (${spatial.regions.length})</div>
      <div>
        ${spatial.regions.map(r => `<span class="rp-badge">${esc(r.name)}</span>`).join('')}
      </div>
    </div>`;
  }

  // Reproducibility
  if (reproducibility.grade) {
    html += `<div class="rp-section">
      <div class="rp-label">Reproducibility</div>
      <div class="rp-text">Grade: ${esc(reproducibility.grade)}</div>
      ${reproducibility.reasoning ? `<div class="rp-text" style="margin-top: 8px;">${esc(reproducibility.reasoning)}</div>` : ''}
    </div>`;
  }

  document.getElementById('rp-body').innerHTML = html;
}

// ============================================================================
// MAP MARKERS
// ============================================================================

function renderMarkers() {
  state.markers.forEach(m => state.map.removeLayer(m));
  state.markers = [];

  state.entities
    .filter(e => e.type === 'Region' && e.attributes.bbox && e.attributes.bbox.some(v => v !== 0))
    .forEach(e => {
      const [minLon, minLat, maxLon, maxLat] = e.attributes.bbox;
      const lat = (minLat + maxLat) / 2;
      const lon = (minLon + maxLon) / 2;

      const m = L.circleMarker([lat, lon], {
        radius: 7,
        fillColor: '#2563eb',
        fillOpacity: 0.8,
        weight: 2,
        color: '#fff'
      }).addTo(state.map);

      m.bindPopup(`<b>${esc(e.attributes.name)}</b><br>${e.attributes.performance || ''}`);
      state.markers.push(m);
    });
}

// ============================================================================
// IMPORT
// ============================================================================

async function doImport() {
  const input = document.getElementById('import-input').value.trim();
  if (!input) return;

  const btn = document.getElementById('import-btn');
  btn.disabled = true;
  setStatus('Starting import...');

  try {
    const res = await fetch('/api/research/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input })
    });

    if (!res.ok) throw new Error('Import failed');
    const { projectId } = await res.json();

    document.getElementById('import-input').value = '';

    // Add temporary project to state
    state.projects.push({
      id: projectId,
      name: 'Unnamed Project',
      description: 'Importing research...',
      entities: [],
      analysis: { status: 'analyzing' }
    });
    renderProjects();

    setStatus('Analyzing in background...');
  } catch (err) {
    setStatus('Failed: ' + err.message);
    alert('Import failed: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

async function cancelAnalysis(projectId) {
  if (!confirm('Cancel this analysis?')) return;
  closePanel();
  await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
  await loadData();
}

async function deleteProject(projectId) {
  if (!confirm('Delete this project? All associated files will be removed.')) return;
  if (state.selectedProject === projectId) {
    closePanel();
  }
  await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
  await loadData();
}

async function clearAll() {
  if (!confirm('Delete all projects and data? All local files will be removed.')) return;
  closePanel();
  await fetch('/api/registry/clear', { method: 'POST' });
  await loadData();
  setStatus('Cleared');
}

// ============================================================================
// UTILITIES
// ============================================================================

function setStatus(text) {
  document.getElementById('status-text').textContent = text;
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ============================================================================
// START
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
