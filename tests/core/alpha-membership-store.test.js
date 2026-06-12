/**
 * AlphaMembershipStore Tests
 * Covers alpha membership quota lifecycle used by the admin UI.
 */

const path = require('path');
const { assert, describe, it, TEST_CONFIG } = require('../setup');
const { AlphaMembershipStore } = require('../../src/alpha/AlphaMembershipStore');

describe('AlphaMembershipStore Quota Tests', () => {
  it('should create memberships with default alpha quota', () => {
    const store = new AlphaMembershipStore(tempMembershipPath());
    const member = store.create('Researcher@Example.com', 'Researcher One');

    assert.strictEqual(member.email, 'researcher@example.com', 'Email should be normalized');
    assert.strictEqual(member.role, 'alpha_user', 'Default role should be alpha_user');
    assert.strictEqual(member.plan, 'alpha_preview', 'Default plan should be alpha_preview');
    assert.deepStrictEqual(member.quota, {
      maxJobsPerMonth: 10,
      maxSourcesPerJob: 5
    }, 'Default quota should match alpha preview limits');
  });

  it('should update quota for an existing membership', () => {
    const store = new AlphaMembershipStore(tempMembershipPath());
    const member = store.create('quota@example.com', 'Quota User');

    const updated = store.updateQuota(member.id, {
      maxJobsPerMonth: 25,
      maxSourcesPerJob: 12
    });

    assert.ok(updated, 'Updated membership should be returned');
    assert.strictEqual(updated.quota.maxJobsPerMonth, 25, 'Monthly job quota should update');
    assert.strictEqual(updated.quota.maxSourcesPerJob, 12, 'Sources per job quota should update');
    assert.strictEqual(store.findById(member.id).quota.maxJobsPerMonth, 25, 'Stored membership should be updated');
  });

  it('should return null when updating quota for an unknown membership', () => {
    const store = new AlphaMembershipStore(tempMembershipPath());
    const updated = store.updateQuota('missing-member', { maxJobsPerMonth: 20 });

    assert.strictEqual(updated, null, 'Unknown member update should return null');
  });

  it('should preserve existing quota values during partial updates', () => {
    const store = new AlphaMembershipStore(tempMembershipPath());
    const member = store.create('partial@example.com', 'Partial User');

    const updated = store.updateQuota(member.id, {
      maxJobsPerMonth: 18
    });

    assert.strictEqual(updated.quota.maxJobsPerMonth, 18, 'Provided quota field should update');
    assert.strictEqual(updated.quota.maxSourcesPerJob, 5, 'Unprovided quota field should be preserved');
  });
});

function tempMembershipPath() {
  return path.join(TEST_CONFIG.tempDir, `alpha-memberships-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}
