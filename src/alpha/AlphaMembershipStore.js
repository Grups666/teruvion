/**
 * Alpha Membership Store
 * Manages activated alpha memberships
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Default alpha plan quota
const DEFAULT_QUOTA = {
  maxJobsPerMonth: 10,
  maxSourcesPerJob: 5
};

const SESSION_TTL_DAYS = 30;

class AlphaMembershipStore {
  constructor(storagePath = null) {
    this.memberships = new Map(); // id -> membership
    this.emailIndex = new Map();  // email -> id (for quick lookup)
    this.storagePath = storagePath || path.join(__dirname, '../../_local/data/alpha-memberships.json');
  }

  /**
   * Create a new membership
   */
  create(email, name) {
    const id = this._generateId();
    const now = new Date().toISOString();

    const membership = {
      id,
      email: email.toLowerCase().trim(),
      name: this._sanitize(name),
      role: 'alpha_user',
      plan: 'alpha_preview',
      quota: { ...DEFAULT_QUOTA },
      session: null,
      createdAt: now
    };

    this.memberships.set(id, membership);
    this.emailIndex.set(membership.email, id);
    return membership;
  }

  /**
   * Find membership by ID
   */
  findById(id) {
    return this.memberships.get(id);
  }

  /**
   * Find membership by email
   */
  findByEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const id = this.emailIndex.get(normalizedEmail);
    return id ? this.memberships.get(id) : null;
  }

  /**
   * Get all memberships
   */
  getAll() {
    return Array.from(this.memberships.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Check if email has membership
   */
  hasMembership(email) {
    return this.emailIndex.has(email.toLowerCase().trim());
  }

  /**
   * Update quota for an existing membership
   */
  updateQuota(id, quota) {
    const membership = this.memberships.get(id);
    if (!membership) {
      return null;
    }

    membership.quota = {
      ...membership.quota,
      ...quota
    };

    return membership;
  }

  /**
   * Rotate the active session token for a membership.
   *
   * Only the latest token remains valid, so one membership can only have one
   * active device/session at a time.
   */
  createSession(id) {
    const membership = this.memberships.get(id);
    if (!membership) {
      return null;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    membership.session = {
      tokenHash: this._hashToken(rawToken),
      issuedAt: now.toISOString(),
      expiresAt
    };

    return {
      token: rawToken,
      expiresAt,
      membership
    };
  }

  /**
   * Find an active membership by its current session token.
   */
  findBySessionToken(token) {
    const rawToken = String(token || '').trim();
    if (!rawToken) return null;

    const tokenHash = this._hashToken(rawToken);
    const now = Date.now();

    for (const membership of this.memberships.values()) {
      const session = membership.session;
      if (!session || !session.tokenHash || !session.expiresAt) {
        continue;
      }

      if (new Date(session.expiresAt).getTime() <= now) {
        continue;
      }

      if (this._safeEqual(session.tokenHash, tokenHash)) {
        return membership;
      }
    }

    return null;
  }

  /**
   * Save to disk
   */
  async save() {
    const data = {
      version: '1.0',
      updated: new Date().toISOString(),
      memberships: Array.from(this.memberships.values())
    };

    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load from disk
   */
  async load() {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8');
      const data = JSON.parse(content);

      this.memberships.clear();
      this.emailIndex.clear();

      for (const membership of data.memberships || []) {
        this.memberships.set(membership.id, membership);
        this.emailIndex.set(membership.email, membership.id);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist yet, start empty
    }
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `member-${timestamp}-${random}`;
  }

  /**
   * Sanitize string input
   */
  _sanitize(str) {
    if (!str) return '';
    return String(str).trim().slice(0, 500);
  }

  _hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  _safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length
      && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }
}

module.exports = { AlphaMembershipStore };
