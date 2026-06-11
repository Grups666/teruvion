/**
 * Alpha Application Store
 * Manages alpha access applications with JSON file storage
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class AlphaApplicationStore {
  constructor(storagePath = null) {
    this.applications = new Map(); // id -> application
    this.storagePath = storagePath || path.join(__dirname, '../../_local/data/alpha-applications.json');
  }

  /**
   * Create a new application
   */
  create(data) {
    const id = this._generateId();
    const now = new Date().toISOString();

    const application = {
      id,
      name: this._sanitize(data.name),
      email: data.email.toLowerCase().trim(),
      affiliation: this._sanitize(data.affiliation),
      researchField: this._sanitize(data.researchField),
      intendedUse: this._sanitize(data.intendedUse),
      websiteOrProfile: data.websiteOrProfile ? this._sanitize(data.websiteOrProfile) : null,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    this.applications.set(id, application);
    return application;
  }

  /**
   * Find application by ID
   */
  findById(id) {
    return this.applications.get(id);
  }

  /**
   * Find application by email
   */
  findByEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();
    for (const app of this.applications.values()) {
      if (app.email === normalizedEmail) {
        return app;
      }
    }
    return null;
  }

  /**
   * Update application status
   */
  updateStatus(id, status) {
    const app = this.applications.get(id);
    if (!app) return null;

    app.status = status;
    app.updatedAt = new Date().toISOString();
    return app;
  }

  /**
   * Get all applications
   */
  getAll() {
    return Array.from(this.applications.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get applications by status
   */
  getByStatus(status) {
    return this.getAll().filter(app => app.status === status);
  }

  /**
   * Save to disk
   */
  async save() {
    const data = {
      version: '1.0',
      updated: new Date().toISOString(),
      applications: Array.from(this.applications.values())
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

      this.applications.clear();
      for (const app of data.applications || []) {
        this.applications.set(app.id, app);
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
    return `app-${timestamp}-${random}`;
  }

  /**
   * Sanitize string input
   */
  _sanitize(str) {
    if (!str) return '';
    return String(str).trim().slice(0, 2000);
  }
}

module.exports = { AlphaApplicationStore };
