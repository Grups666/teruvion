'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '../../../types/client';

function VerifyContent() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get('code') || '';

  const [code, setCode] = useState(codeFromUrl);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid' | 'activating' | 'activated'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (codeFromUrl) {
      verifyCode(codeFromUrl);
    }
  }, [codeFromUrl]);

  async function verifyCode(codeToVerify: string) {
    setStatus('verifying');
    setError(null);

    try {
      const result = await api.verifyInviteCode(codeToVerify);
      if (result.valid) {
        setStatus('valid');
        setVerifiedEmail(result.email || '');
        setEmail(result.email || '');
      } else {
        setStatus('invalid');
        setError(result.error || 'Invalid invite code');
      }
    } catch (err: any) {
      setStatus('invalid');
      setError(err.message || 'Verification failed');
    }
  }

  async function handleActivate() {
    setStatus('activating');
    setError(null);

    try {
      const result = await api.activateMembership(code, email, name);
      if (result.success) {
        if (result.accessToken) {
          api.setAccessCode(result.accessToken);
          sessionStorage.setItem('teruvionAccessToken', result.accessToken);
        }
        if (result.accessTokenExpiresAt) {
          sessionStorage.setItem('teruvionAccessTokenExpiresAt', result.accessTokenExpiresAt);
        }
        setStatus('activated');
      }
    } catch (err: any) {
      setError(err.message || 'Activation failed');
      setStatus('valid');
    }
  }

  if (status === 'activated') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="text-4xl mb-6">✓</div>
          <h1 className="text-2xl font-semibold mb-4">Welcome to Teruvion Alpha</h1>
          <p className="text-gray-600 mb-6">
            Your account has been activated on this browser. You can now start exploring Digital Earth Intelligence.
          </p>
          <a
            href="/"
            className="inline-block py-2 px-6 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
          >
            Get Started
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold mb-2">Verify Invite Code</h1>
          <p className="text-gray-600 text-sm">
            Enter your invite code to activate your Teruvion Alpha access.
          </p>
        </div>

        {status === 'idle' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Invite Code</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400 uppercase tracking-wider font-mono"
                placeholder="XXXXXXXX"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
            </div>
            <button
              onClick={() => verifyCode(code)}
              disabled={code.length !== 8}
              className="w-full py-2 px-4 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Verify Code
            </button>
          </div>
        )}

        {(status === 'verifying' || status === 'activating') && (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-black rounded-full mx-auto mb-4" />
            <p className="text-gray-600 text-sm">
              {status === 'verifying' ? 'Verifying code...' : 'Activating account...'}
            </p>
          </div>
        )}

        {status === 'invalid' && (
          <div className="space-y-4">
            <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-md">
              {error}
            </div>
            <button
              onClick={() => { setStatus('idle'); setError(null); }}
              className="w-full py-2 px-4 border border-gray-200 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {status === 'valid' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3">
              <p className="text-sm text-green-800">
                ✓ Invite code is valid
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Name (optional)</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gray-400"
                placeholder="Your display name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <button
              onClick={handleActivate}
              className="w-full py-2 px-4 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
            >
              Activate Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlphaVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
