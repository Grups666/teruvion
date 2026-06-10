/**
 * EventLog - Object-Centric Process Mining (OCPM)
 * Records all operations and the objects involved
 */

const fs = require('fs').promises;
const path = require('path');

class EventLog {
  constructor(logPath = null) {
    this.logPath = logPath || path.join(__dirname, '../../_local/events.jsonl');
    this.events = [];
  }

  /**
   * Record an event
   * @param {string} type - Event type (ingest|decompose|link|compare|recompose|verify|execute)
   * @param {string[]} objectIds - IDs of entities involved
   * @param {object} details - Event-specific details
   */
  async record(type, objectIds, details = {}) {
    const event = {
      id: this._generateEventId(),
      type,
      timestamp: new Date().toISOString(),
      objects: Array.isArray(objectIds) ? objectIds : [objectIds],
      details,
      actor: details.actor || 'system'
    };

    this.events.push(event);
    await this._append(event);

    return event.id;
  }

  /**
   * Get all events for a specific object
   */
  getEventsForObject(objectId) {
    return this.events.filter(e => e.objects.includes(objectId));
  }

  /**
   * Get all objects involved in a specific event
   */
  getObjectsForEvent(eventId) {
    const event = this.events.find(e => e.id === eventId);
    return event ? event.objects : [];
  }

  /**
   * Get object lifecycle (all events it participated in)
   */
  getObjectLifecycle(objectId) {
    const events = this.getEventsForObject(objectId);
    return events.map(e => ({
      timestamp: e.timestamp,
      type: e.type,
      details: e.details,
      otherObjects: e.objects.filter(id => id !== objectId)
    }));
  }

  /**
   * Get object collaboration patterns
   * Which objects frequently appear together in events?
   */
  getObjectCollaboration() {
    const cooccurrence = new Map();

    for (const event of this.events) {
      const objects = event.objects;

      // Compute pairwise co-occurrence
      for (let i = 0; i < objects.length; i++) {
        for (let j = i + 1; j < objects.length; j++) {
          const pair = [objects[i], objects[j]].sort().join('|');
          cooccurrence.set(pair, (cooccurrence.get(pair) || 0) + 1);
        }
      }
    }

    return Array.from(cooccurrence.entries())
      .map(([pair, count]) => {
        const [obj1, obj2] = pair.split('|');
        return { obj1, obj2, count };
      })
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get event statistics
   */
  getStats() {
    const typeCount = {};
    const objectCount = new Map();

    for (const event of this.events) {
      // Count event types
      typeCount[event.type] = (typeCount[event.type] || 0) + 1;

      // Count object participation
      for (const objId of event.objects) {
        objectCount.set(objId, (objectCount.get(objId) || 0) + 1);
      }
    }

    // Top 10 most active objects
    const topObjects = Array.from(objectCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ objectId: id, eventCount: count }));

    return {
      totalEvents: this.events.length,
      eventsByType: typeCount,
      uniqueObjects: objectCount.size,
      topObjects
    };
  }

  /**
   * Load events from disk
   */
  async load() {
    try {
      const content = await fs.readFile(this.logPath, 'utf8');
      this.events = content.trim().split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.events = [];
        return false;
      }
      throw err;
    }
  }

  /**
   * Save all events to disk (overwrites)
   */
  async save() {
    // EventLog uses append-only, so save is a no-op
    // Events are already persisted via _append
    return true;
  }

  /**
   * Clear all events (use with caution)
   */
  async clear() {
    this.events = [];
    try {
      await fs.unlink(this.logPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  async _append(event) {
    try {
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      await fs.appendFile(this.logPath, JSON.stringify(event) + '\n');
    } catch (err) {
      console.error('Failed to append event:', err);
    }
  }

  _generateEventId() {
    return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }
}

module.exports = EventLog;
