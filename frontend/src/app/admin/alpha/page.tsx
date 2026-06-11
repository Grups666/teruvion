'use client';

import React, { useState, useEffect } from 'react';
import api from '../../types/client';
import type { AlphaApplication } from '../../types/api';

export default function AdminAlphaPage() {
  const [adminSecret, setAdminSecret] = useState('');
  const [applications, setApplications] = useState<AlphaApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('adminSecret');
    if (saved) setAdminSecret(saved);
  }, []);

  useEffect(() => {
    if (adminSecret) {
      sessionStorage.setItem('adminSecret', adminSecret);
    }
  }, [adminSecret]);

  async function loadApplications() {
    if (!adminSecret) return;
    setLoading(true);
    setError(null);

    try {
      const result = await api.getAlphaApplications(adminSecret);
      setApplications(result.applications);
    } catch (err: any) {
      setError(err.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setProcessingId(id);
    setError(null);
    setLastInviteCode(null);

    try {
      const result = await api.approveApplication(id, adminSecret);
      setLastInviteCode(result.inviteCode);
      await loadApplications();
    } catch (err: any) {
      setError(err.message || 'Failed to approve');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!confirm('Reject this application?')) return;
    setProcessingId(id);
    setError(null);

    try {
      await api.rejectApplication(id, adminSecret);
      await loadApplications();
    } catch (err: any) {
      setError(err.message || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  }

  const filteredApplications = applications.filter(app => {
    if (filter === 'all') return true;
    return app.status === filter;
  });

  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">Alpha Applications</h1>
          <p className="text-gray-600 text-sm">Manage applications for the Teruvion Alpha program.</p>
        </div>

        {/* Admin Secret Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Admin Secret</label>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
              placeholder="Enter admin secret"
              value={adminSecret}
              onChange={e => setAdminSecret(e.target.value)}
            />
            <button
              onClick={loadApplications}
              disabled={!adminSecret || loading}
              className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {lastInviteCode && (
          <div className="mb-4 text-sm text-green-800 bg-green-50 px-4 py-3 rounded-md">
            <span className="font-medium">Invite code generated: </span>
            <code className="font-mono bg-white px-2 py-1 rounded">{lastInviteCode}</code>
          </div>
        )}

        {/* Stats */}
        {applications.length > 0 && (
          <div className="flex gap-4 mb-6 text-sm">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1 rounded ${filter === 'pending' ? 'bg-yellow-100 text-yellow-800 font-medium' : 'text-gray-500'}`}
            >
              Pending ({stats.pending})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-3 py-1 rounded ${filter === 'approved' ? 'bg-green-100 text-green-800 font-medium' : 'text-gray-500'}`}
            >
              Approved ({stats.approved})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-3 py-1 rounded ${filter === 'rejected' ? 'bg-red-100 text-red-800 font-medium' : 'text-gray-500'}`}
            >
              Rejected ({stats.rejected})
            </button>
          </div>
        )}

        {/* Applications List */}
        {applications.length > 0 && (
          <div className="space-y-4">
            {filteredApplications.map(app => (
              <div key={app.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium">{app.name}</h3>
                    <p className="text-sm text-gray-500">{app.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    app.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    app.status === 'approved' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {app.status}
                  </span>
                </div>

                <div className="text-sm text-gray-600 space-y-1 mb-3">
                  <p><span className="text-gray-400">Affiliation:</span> {app.affiliation}</p>
                  <p><span className="text-gray-400">Field:</span> {app.researchField}</p>
                  <p><span className="text-gray-400">Use:</span> {app.intendedUse}</p>
                  {app.websiteOrProfile && (
                    <p><span className="text-gray-400">Website:</span> {app.websiteOrProfile}</p>
                  )}
                </div>

                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span>{new Date(app.createdAt).toLocaleString()}</span>
                  {app.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(app.id)}
                        disabled={processingId === app.id}
                        className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(app.id)}
                        disabled={processingId === app.id}
                        className="px-3 py-1 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {applications.length === 0 && adminSecret && !loading && (
          <div className="text-center py-12 text-gray-500">
            No applications found.
          </div>
        )}
      </div>
    </div>
  );
}
