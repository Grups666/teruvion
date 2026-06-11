'use client';

import React, { useState } from 'react';
import api from '../../types/client';
import type { AlphaApplicationInput } from '../../types/api';

export default function AlphaApplyPage() {
  const [formData, setFormData] = useState<AlphaApplicationInput>({
    name: '',
    email: '',
    affiliation: '',
    researchField: '',
    intendedUse: '',
    websiteOrProfile: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof AlphaApplicationInput, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await api.submitAlphaApplication(formData);
      if (result.success) {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="text-4xl mb-6">✓</div>
          <h1 className="text-2xl font-semibold mb-4">Application Submitted</h1>
          <p className="text-gray-600 mb-6">
            Thank you for applying to the Teruvion Alpha program.
            We'll review your application and get back to you shortly.
          </p>
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700">
            Return to home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-2">Apply for Alpha Access</h1>
          <p className="text-gray-600 text-sm">
            Join the Teruvion Alpha program to explore Digital Earth Intelligence.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
              value={formData.name}
              onChange={e => updateField('name', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
              value={formData.email}
              onChange={e => updateField('email', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Affiliation *</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
              placeholder="University, company, or organization"
              value={formData.affiliation}
              onChange={e => updateField('affiliation', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Research Field *</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
              placeholder="e.g., Hydrology, Climate Science, Remote Sensing"
              value={formData.researchField}
              onChange={e => updateField('researchField', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Intended Use *</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400 resize-none"
              rows={3}
              placeholder="How do you plan to use Teruvion?"
              value={formData.intendedUse}
              onChange={e => updateField('intendedUse', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Website / Profile</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
              placeholder="Optional: personal website, GitHub, or LinkedIn"
              value={formData.websiteOrProfile}
              onChange={e => updateField('websiteOrProfile', e.target.value)}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          By applying, you agree to use Teruvion for research purposes during the alpha period.
        </p>
      </div>
    </div>
  );
}
