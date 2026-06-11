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
}

module.exports = { AlphaMembershipStore };
