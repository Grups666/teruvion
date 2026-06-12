/**
 * API Client - Centralized API calls
 *
 * All backend communication goes through this module.
 * Frontend components should only use these functions, not direct fetch.
 */

import type {
  Entity,
  Project,
  EntitiesResponse,
  ProjectsResponse,
  ImportResponse,
  SSEEvent,
  EntityExploreResponse,
  AlphaApplication,
  AlphaApplicationInput,
  AlphaMembership
} from './api';

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;

    if (hostname === 'teruvion.com' || hostname === 'www.teruvion.com') {
      return 'https://api.teruvion.com';
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }

    if (hostname.startsWith('api.')) {
      return '';
    }

    return `${protocol}//${hostname}`;
  }

  return '';
}

const API_BASE = resolveApiBase();

class APIClient {
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error || body?.message || '';
      } catch {}

      throw new Error(detail || `API Error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  // Entities
  async getEntities(): Promise<EntitiesResponse> {
    return this.request<EntitiesResponse>('/entities');
  }

  async getEntity(id: string): Promise<{ entity: Entity }> {
    return this.request(`/entities/${id}`);
  }

  async getEntityRelations(id: string): Promise<any> {
    return this.request(`/entities/${id}/relations`);
  }

  async exploreEntity(id: string): Promise<EntityExploreResponse> {
    return this.request(`/entities/${id}/explore`);
  }

  // Projects
  async getProjects(): Promise<ProjectsResponse> {
    return this.request<ProjectsResponse>('/projects');
  }

  async getProject(id: string): Promise<{ project: Project }> {
    return this.request(`/projects/${id}`);
  }

  async getProjectLenses(id: string): Promise<Record<string, any>> {
    return this.request(`/projects/${id}/lens`);
  }

  async deleteProject(id: string): Promise<void> {
    await this.request(`/projects/${id}`, { method: 'DELETE' });
  }

  async cancelProjectImport(id: string): Promise<{ success: boolean; message: string; project?: Project | null }> {
    return this.request(`/projects/${id}/cancel`, { method: 'POST' });
  }

  // Import
  async importSource(input: string): Promise<ImportResponse> {
    return this.request<ImportResponse>('/import', {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  // SSE - Subscribe to project events
  // Returns unsubscribe function
  subscribeToProject(
    projectId: string,
    onEvent: (event: SSEEvent) => void,
    onError?: () => void
  ): () => void {
    const es = new EventSource(`${API_BASE}/api/projects/${projectId}/events`);

    es.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as SSEEvent;
      onEvent(parsed);
    };

    es.onerror = () => {
      es.close();
      onError?.();
    };

    return () => {
      try { es.close(); } catch {}
    };
  }

  // Clear all
  async clearAll(): Promise<void> {
    await this.request('/registry/clear', { method: 'POST' });
  }

  // Alpha Access
  async submitAlphaApplication(data: AlphaApplicationInput): Promise<{ success: boolean; applicationId: string }> {
    return this.request('/alpha/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAlphaApplications(adminSecret: string): Promise<{ applications: AlphaApplication[]; count: number }> {
    return this.request('/alpha/applications', {
      headers: { 'X-Admin-Secret': adminSecret },
    });
  }

  async approveApplication(id: string, adminSecret: string): Promise<{ success: boolean; inviteCode: string }> {
    return this.request(`/alpha/applications/${id}/approve`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': adminSecret },
    });
  }

  async rejectApplication(id: string, adminSecret: string): Promise<{ success: boolean }> {
    return this.request(`/alpha/applications/${id}/reject`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': adminSecret },
    });
  }

  async verifyInviteCode(code: string): Promise<{ valid: boolean; email?: string; error?: string }> {
    return this.request('/alpha/invites/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async activateMembership(code: string, email: string, name?: string): Promise<{ success: boolean; membershipId: string }> {
    return this.request('/alpha/memberships/activate', {
      method: 'POST',
      body: JSON.stringify({ code, email, name }),
    });
  }

  async getAlphaMemberships(adminSecret: string): Promise<{ memberships: AlphaMembership[]; count: number }> {
    return this.request('/alpha/memberships', {
      headers: { 'X-Admin-Secret': adminSecret },
    });
  }

  async updateAlphaMembershipQuota(
    id: string,
    adminSecret: string,
    quota: { maxJobsPerMonth: number; maxSourcesPerJob: number }
  ): Promise<{ success: boolean; membership: AlphaMembership }> {
    return this.request(`/alpha/memberships/${id}/quota`, {
      method: 'PATCH',
      headers: { 'X-Admin-Secret': adminSecret },
      body: JSON.stringify(quota),
    });
  }
}

export const api = new APIClient();
export default api;
