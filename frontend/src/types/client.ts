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
  SSEEvent
} from './api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

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
      throw new Error(`API Error: ${res.status} ${res.statusText}`);
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

  // Projects
  async getProjects(): Promise<ProjectsResponse> {
    return this.request<ProjectsResponse>('/projects');
  }

  async getProject(id: string): Promise<{ project: Project }> {
    return this.request(`/projects/${id}`);
  }

  async deleteProject(id: string): Promise<void> {
    await this.request(`/projects/${id}`, { method: 'DELETE' });
  }

  // Import
  async importSource(input: string): Promise<ImportResponse> {
    return this.request<ImportResponse>('/import', {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  // SSE
  subscribeToProject(projectId: string, onEvent: (event: SSEEvent) => void): () => void {
    const es = new EventSource(`${API_BASE}/api/projects/${projectId}/events`);

    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as SSEEvent;
      onEvent(data);
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }

  // Clear all
  async clearAll(): Promise<void> {
    await this.request('/registry/clear', { method: 'POST' });
  }
}

export const api = new APIClient();
export default api;
