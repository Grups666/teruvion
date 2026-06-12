'use client';

import React, { useState, useEffect } from 'react';
import api from '../../../types/client';
import type { AlphaApplication, AlphaMembership } from '../../../types/api';

export default function AdminAlphaPage() {
  const [adminSecret, setAdminSecret] = useState('');
  const [applications, setApplications] = useState<AlphaApplication[]>([]);
  const [memberships, setMemberships] = useState<AlphaMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [view, setView] = useState<'applications' | 'members'>('applications');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, { maxJobsPerMonth: number; maxSourcesPerJob: number }>>({});

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
    setNotice(null);

    try {
      const [applicationResult, membershipResult] = await Promise.all([
        api.getAlphaApplications(adminSecret),
        api.getAlphaMemberships(adminSecret)
      ]);
      setApplications(applicationResult.applications);
      setMemberships(membershipResult.memberships);
      setQuotaDrafts(Object.fromEntries(membershipResult.memberships.map(member => [
        member.id,
        {
          maxJobsPerMonth: member.quota.maxJobsPerMonth,
          maxSourcesPerJob: member.quota.maxSourcesPerJob
        }
      ])));
      if (applicationResult.applications.length === 0 && membershipResult.memberships.length > 0) {
        setView('members');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alpha data');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setProcessingId(id);
    setError(null);
    setLastInviteCode(null);
    setNotice(null);

    try {
      const result = await api.approveApplication(id, adminSecret);
      setLastInviteCode(result.inviteCode);
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!confirm('Reject this application?')) return;
    setProcessingId(id);
    setError(null);
    setNotice(null);

    try {
      await api.rejectApplication(id, adminSecret);
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  }

  async function copyMembersCsv() {
    const header = ['id', 'name', 'email', 'role', 'plan', 'maxJobsPerMonth', 'maxSourcesPerJob', 'createdAt'];
    const rows = memberships.map(member => [
      member.id,
      member.name,
      member.email,
      member.role,
      member.plan,
      String(member.quota.maxJobsPerMonth),
      String(member.quota.maxSourcesPerJob),
      member.createdAt
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(escapeCsvCell).join(','))
      .join('\n');

    try {
      await navigator.clipboard.writeText(csv);
      setError(null);
      setNotice('Members CSV copied');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy members CSV');
    }
  }

  function updateQuotaDraft(id: string, field: 'maxJobsPerMonth' | 'maxSourcesPerJob', value: string) {
    const parsed = Number(value);
    setQuotaDrafts(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || { maxJobsPerMonth: 10, maxSourcesPerJob: 5 }),
        [field]: Number.isFinite(parsed) ? parsed : 0
      }
    }));
  }

  async function saveMemberQuota(member: AlphaMembership) {
    const draft = quotaDrafts[member.id];
    if (!draft) return;

    setProcessingId(member.id);
    setError(null);
    setNotice(null);

    try {
      const result = await api.updateAlphaMembershipQuota(member.id, adminSecret, draft);
      setMemberships(prev => prev.map(item => item.id === member.id ? result.membership : item));
      setQuotaDrafts(prev => ({
        ...prev,
        [member.id]: {
          maxJobsPerMonth: result.membership.quota.maxJobsPerMonth,
          maxSourcesPerJob: result.membership.quota.maxSourcesPerJob
        }
      }));
      setNotice(`Quota updated for ${result.membership.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quota');
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
    members: memberships.length,
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

        {notice && (
          <div className="mb-4 text-sm text-blue-800 bg-blue-50 px-4 py-3 rounded-md">
            {notice}
          </div>
        )}

        {lastInviteCode && (
          <div className="mb-4 text-sm text-green-800 bg-green-50 px-4 py-3 rounded-md">
            <span className="font-medium">Invite code generated: </span>
            <code className="font-mono bg-white px-2 py-1 rounded">{lastInviteCode}</code>
          </div>
        )}

        {(applications.length > 0 || memberships.length > 0) && (
          <div className="flex justify-between gap-3 mb-6 text-sm">
            <div className="flex gap-2">
              <button
                onClick={() => setView('applications')}
                className={`px-3 py-2 rounded-md ${view === 'applications' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Applications ({stats.total})
              </button>
              <button
                onClick={() => setView('members')}
                className={`px-3 py-2 rounded-md ${view === 'members' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Members ({stats.members})
              </button>
            </div>
            {view === 'members' && memberships.length > 0 && (
              <button
                onClick={copyMembersCsv}
                className="px-3 py-2 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Copy CSV
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        {view === 'applications' && applications.length > 0 && (
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
        {view === 'applications' && applications.length > 0 && (
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

        {view === 'members' && memberships.length > 0 && (
          <div className="space-y-4">
            {memberships.map(member => (
              <div key={member.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium">{member.name}</h3>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-800">
                    {member.plan}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-3">
                  <div className="bg-gray-50 rounded-md px-3 py-2">
                    <div className="text-xs text-gray-400 mb-1">Role</div>
                    <div className="font-medium text-gray-800">{member.role}</div>
                  </div>
                  <div className="bg-gray-50 rounded-md px-3 py-2">
                    <div className="text-xs text-gray-400 mb-2">Quota</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800"
                        value={quotaDrafts[member.id]?.maxJobsPerMonth ?? member.quota.maxJobsPerMonth}
                        onChange={event => updateQuotaDraft(member.id, 'maxJobsPerMonth', event.target.value)}
                        aria-label={`${member.email} max jobs per month`}
                      />
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800"
                        value={quotaDrafts[member.id]?.maxSourcesPerJob ?? member.quota.maxSourcesPerJob}
                        onChange={event => updateQuotaDraft(member.id, 'maxSourcesPerJob', event.target.value)}
                        aria-label={`${member.email} max sources per job`}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">jobs/mo - sources/job</div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span>{member.id}</span>
                  <div className="flex items-center gap-3">
                    <span>{new Date(member.createdAt).toLocaleString()}</span>
                    <button
                      onClick={() => saveMemberQuota(member)}
                      disabled={processingId === member.id}
                      className="px-3 py-1 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
                    >
                      {processingId === member.id ? 'Saving...' : 'Save quota'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'applications' && applications.length === 0 && adminSecret && !loading && (
          <div className="text-center py-12 text-gray-500">
            No applications found.
          </div>
        )}

        {view === 'members' && memberships.length === 0 && adminSecret && !loading && (
          <div className="text-center py-12 text-gray-500">
            No activated members yet.
          </div>
        )}
      </div>
    </div>
  );
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
