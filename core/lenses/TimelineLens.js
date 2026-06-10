/**
 * Timeline Lens
 * Temporal evolution of research
 */

const Lens = require('./Lens');

class TimelineLens extends Lens {
  getName() {
    return 'timeline';
  }

  getDescription() {
    return 'Temporal evolution of research showing chronological progression';
  }

  getRelevantEntityTypes() {
    return ['TimeRange', 'Time', 'Event', 'Paper'];
  }

  getRelevantRelationTypes() {
    return ['during', 'references', 'derives_from'];
  }

  async render(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const events = [];

    // Extract temporal information from entities
    for (const entity of entities) {
      const temporal = this._extractTemporalInfo(entity);
      if (temporal) {
        events.push({
          entityId: entity.id,
          name: entity.getDisplayName(),
          type: entity.type,
          ...temporal
        });
      }
    }

    // Sort by start time
    events.sort((a, b) => (a.start || 0) - (b.start || 0));

    // Build timeline structure
    const timeline = this._buildTimeline(events);

    return {
      type: 'timeline',
      events,
      timeline,
      metadata: this.generateMetadata(projectId, {
        totalEvents: events.length,
        timespan: timeline.span
      })
    };
  }

  _extractTemporalInfo(entity) {
    // Paper with year
    if (entity.attributes.year) {
      return {
        start: entity.attributes.year,
        end: entity.attributes.year,
        label: String(entity.attributes.year)
      };
    }

    // TimeRange
    if (entity.type === 'TimeRange') {
      return {
        start: this._parseTime(entity.attributes.start),
        end: this._parseTime(entity.attributes.end),
        label: `${entity.attributes.start} - ${entity.attributes.end}`
      };
    }

    // Dataset with temporal coverage
    if (entity.attributes.temporalCoverage) {
      const coverage = entity.attributes.temporalCoverage;
      if (typeof coverage === 'string' && coverage.includes('-')) {
        const [start, end] = coverage.split('-').map(s => parseInt(s.trim()));
        return {
          start,
          end,
          label: coverage
        };
      }
    }

    // Event
    if (entity.type === 'Event' || entity.type === 'FloodEvent') {
      if (entity.attributes.date || entity.metadata?.date) {
        const dateStr = entity.attributes.date || entity.metadata.date;
        return {
          start: this._parseTime(dateStr),
          end: this._parseTime(dateStr),
          label: dateStr
        };
      }
    }

    return null;
  }

  _parseTime(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Try to extract year
      const yearMatch = value.match(/\d{4}/);
      if (yearMatch) return parseInt(yearMatch[0]);
    }
    return null;
  }

  _buildTimeline(events) {
    if (events.length === 0) {
      return { intervals: [], span: null };
    }

    const years = events
      .map(e => e.start)
      .filter(y => y !== null);

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Create decade intervals
    const intervals = [];
    const startDecade = Math.floor(minYear / 10) * 10;
    const endDecade = Math.ceil(maxYear / 10) * 10;

    for (let decade = startDecade; decade <= endDecade; decade += 10) {
      const decadeEvents = events.filter(e =>
        e.start >= decade && e.start < decade + 10
      );

      if (decadeEvents.length > 0) {
        intervals.push({
          decade: `${decade}s`,
          start: decade,
          end: decade + 9,
          count: decadeEvents.length,
          types: this._countTypes(decadeEvents)
        });
      }
    }

    return {
      intervals,
      span: { start: minYear, end: maxYear }
    };
  }

  _countTypes(events) {
    const counts = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return counts;
  }
}

module.exports = TimelineLens;