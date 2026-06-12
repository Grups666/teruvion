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
    const temporalFields = new Set([
      'year',
      'date',
      'start',
      'end',
      'time',
      'timestamp',
      'temporalCoverage',
      'temporalSpan',
      'publishedAt',
      'createdAt',
      'updatedAt'
    ]);

    return Object.entries(this.ontology.ENTITY_SCHEMAS || {})
      .filter(([, schema]) => {
        const fields = [
          ...(schema.required || []),
          ...(schema.optional || [])
        ];
        return fields.some(field => temporalFields.has(field));
      })
      .map(([type]) => type);
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
    const attributes = entity.attributes || {};
    const metadata = entity.metadata || {};

    if (attributes.year) {
      return {
        start: this._parseTime(attributes.year),
        end: this._parseTime(attributes.year),
        label: String(attributes.year)
      };
    }

    if (attributes.start || attributes.end) {
      return {
        start: this._parseTime(attributes.start),
        end: this._parseTime(attributes.end || attributes.start),
        label: this._formatRangeLabel(attributes.start, attributes.end || attributes.start)
      };
    }

    const coverage = attributes.temporalCoverage || attributes.temporalSpan || metadata.temporalCoverage;
    if (coverage) {
      return this._parseCoverage(coverage);
    }

    const pointInTime = attributes.date ||
      attributes.time ||
      attributes.timestamp ||
      attributes.publishedAt ||
      attributes.createdAt ||
      attributes.updatedAt ||
      metadata.date ||
      metadata.timestamp;

    if (pointInTime) {
      return {
        start: this._parseTime(pointInTime),
        end: this._parseTime(pointInTime),
        label: String(pointInTime)
      };
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

  _parseCoverage(coverage) {
    if (Array.isArray(coverage)) {
      const [startValue, endValue = startValue] = coverage;
      return {
        start: this._parseTime(startValue),
        end: this._parseTime(endValue),
        label: this._formatRangeLabel(startValue, endValue)
      };
    }

    if (typeof coverage === 'object') {
      const startValue = coverage.start || coverage.from || coverage.begin;
      const endValue = coverage.end || coverage.to || coverage.finish || startValue;
      return {
        start: this._parseTime(startValue),
        end: this._parseTime(endValue),
        label: this._formatRangeLabel(startValue, endValue)
      };
    }

    if (typeof coverage === 'string') {
      const rangeMatch = coverage.match(/(\d{4})(?:[^\d]+)(\d{4})/);
      if (rangeMatch) {
        return {
          start: parseInt(rangeMatch[1], 10),
          end: parseInt(rangeMatch[2], 10),
          label: coverage
        };
      }
      const parsed = this._parseTime(coverage);
      return {
        start: parsed,
        end: parsed,
        label: coverage
      };
    }

    return null;
  }

  _formatRangeLabel(start, end) {
    if (start === undefined && end === undefined) return '';
    if (start === end || end === undefined) return String(start);
    return `${start} - ${end}`;
  }

  _buildTimeline(events) {
    if (events.length === 0) {
      return { intervals: [], span: null };
    }

    const years = events
      .map(e => e.start)
      .filter(y => y !== null && !Number.isNaN(y));

    if (years.length === 0) {
      return { intervals: [], span: null };
    }

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
