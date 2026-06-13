#!/usr/bin/env node
/**
 * Test Alpha Application Flow
 *
 * Tests the complete alpha access flow:
 * 1. Submit application
 * 2. List applications as admin
 * 3. Approve application
 * 4. Verify invite code
 * 5. Activate membership and receive a session token
 * 6. Log in with the invite code and rotate to a new session token
 * 7. Confirm the old token is invalid and the latest token works
 */

const path = require('path');
const fs = require('fs');
process.chdir(path.join(__dirname, '..'));

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || loadLocalAdminSecret();

function parseJSONC(content) {
  const lines = content.split('\n');
  const cleanedLines = lines.map(line => {
    const commentIndex = line.indexOf('//');
    if (commentIndex === -1) return line;

    const beforeComment = line.substring(0, commentIndex);
    const quoteCount = (beforeComment.match(/"/g) || []).length;
    return quoteCount % 2 === 0 ? line.substring(0, commentIndex) : line;
  });

  return JSON.parse(cleanedLines.join('\n').replace(/\/\*[\s\S]*?\*\//g, ''));
}

function loadLocalAdminSecret() {
  const candidates = [
    path.join(process.cwd(), '_local/config/admin.local.json'),
    path.join(process.cwd(), '_local/config/llm.local.jsonc')
  ];

  for (const file of candidates) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const parsed = file.endsWith('.jsonc') ? parseJSONC(content) : JSON.parse(content);
      if (parsed.adminSecret) return parsed.adminSecret;
    } catch {
      // Try the next local config candidate.
    }
  }

  return '';
}

const testApplication = {
  name: 'Test User',
  email: `test-${Date.now()}@example.com`,
  affiliation: 'Test University',
  researchField: 'Hydrology',
  intendedUse: 'Testing the alpha access flow',
  websiteOrProfile: 'https://example.com'
};

let applicationId = null;
let inviteCode = null;
let firstAccessToken = null;
let secondAccessToken = null;

async function request(pathname, options = {}) {
  const url = `${API_BASE}/api${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json();
  return { status: res.status, data };
}

async function test() {
  if (!ADMIN_SECRET) {
    console.error('Missing admin secret. Set ADMIN_SECRET or _local/config/admin.local.json.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Testing Alpha Access Flow');
  console.log('='.repeat(60));
  console.log();

  console.log('[1/7] Submitting application...');
  const submitRes = await request('/alpha/apply', {
    method: 'POST',
    body: JSON.stringify(testApplication),
  });

  if (submitRes.status !== 200 || !submitRes.data.success) {
    console.error('[FAIL] Failed to submit application:', submitRes.data);
    process.exit(1);
  }

  applicationId = submitRes.data.applicationId;
  console.log(`[PASS] Application submitted: ${applicationId}`);

  console.log('\n[2/7] Fetching applications as admin...');
  const listRes = await request('/alpha/applications', {
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  });

  if (listRes.status !== 200) {
    console.error('[FAIL] Failed to list applications:', listRes.data);
    process.exit(1);
  }

  const found = listRes.data.applications.find(a => a.id === applicationId);
  if (!found) {
    console.error('[FAIL] Application not found in list');
    process.exit(1);
  }

  console.log(`[PASS] Found application in list (${listRes.data.count} total)`);

  console.log('\n[3/7] Approving application...');
  const approveRes = await request(`/alpha/applications/${applicationId}/approve`, {
    method: 'POST',
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  });

  if (approveRes.status !== 200 || !approveRes.data.success) {
    console.error('[FAIL] Failed to approve application:', approveRes.data);
    process.exit(1);
  }

  inviteCode = approveRes.data.inviteCode;
  console.log(`[PASS] Application approved, invite code: ${inviteCode}`);

  console.log('\n[4/7] Verifying invite code...');
  const verifyRes = await request('/alpha/invites/verify', {
    method: 'POST',
    body: JSON.stringify({ code: inviteCode }),
  });

  if (!verifyRes.data.valid) {
    console.error('[FAIL] Invite code invalid:', verifyRes.data);
    process.exit(1);
  }

  console.log(`[PASS] Invite code valid for: ${verifyRes.data.email}`);

  console.log('\n[5/7] Activating membership...');
  const activateRes = await request('/alpha/memberships/activate', {
    method: 'POST',
    body: JSON.stringify({
      code: inviteCode,
      email: testApplication.email,
      name: testApplication.name,
    }),
  });

  if (activateRes.status !== 200 || !activateRes.data.success || !activateRes.data.accessToken) {
    console.error('[FAIL] Failed to activate membership:', activateRes.data);
    process.exit(1);
  }

  firstAccessToken = activateRes.data.accessToken;
  console.log(`[PASS] Membership activated: ${activateRes.data.membershipId}`);

  console.log('\n[6/7] Logging in again with activated invite code...');
  const loginRes = await request('/alpha/access/verify', {
    method: 'POST',
    body: JSON.stringify({ code: inviteCode }),
  });

  if (loginRes.status !== 200 || !loginRes.data.valid || !loginRes.data.accessToken) {
    console.error('[FAIL] Failed to log in with invite code:', loginRes.data);
    process.exit(1);
  }

  secondAccessToken = loginRes.data.accessToken;
  console.log('[PASS] Invite login returned a fresh session token');

  const oldTokenRes = await request('/projects', {
    headers: { 'X-Teruvion-Access': firstAccessToken },
  });

  if (oldTokenRes.status !== 401) {
    console.error('[FAIL] Old session token should have been invalidated:', oldTokenRes.status, oldTokenRes.data);
    process.exit(1);
  }

  console.log('[PASS] Previous session token was invalidated');

  console.log('\n[7/7] Checking protected API with latest session...');
  const currentTokenRes = await request('/projects', {
    headers: { 'X-Teruvion-Access': secondAccessToken },
  });

  if (currentTokenRes.status !== 200) {
    console.error('[FAIL] Latest session token cannot access protected API:', currentTokenRes.data);
    process.exit(1);
  }

  console.log('[PASS] Latest session token can access protected API');

  console.log('\n' + '='.repeat(60));
  console.log('All tests passed!');
  console.log('='.repeat(60));
  console.log(`
Application ID: ${applicationId}
Invite Code:    ${inviteCode}
Membership ID:  ${activateRes.data.membershipId}
Access Token:   ${secondAccessToken.slice(0, 12)}...
  `);
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
