/**
 * SourceCoverage
 *
 * Summarizes how much source material was available for object extraction.
 * This is a transport-level quality signal, not semantic understanding.
 */

function summarizeSourceCoverage(content = {}) {
  const sections = content.sections || {};
  const figures = Array.isArray(content.figures) ? content.figures : [];
  const tables = Array.isArray(content.tables) ? content.tables : [];
  const provenance = content.provenance || {};
  const contentLevel = content.contentLevel || provenance.level || 'unknown';

  const sectionNames = Object.entries(sections)
    .filter(([_, value]) => typeof value === 'string' ? value.trim().length > 0 : Boolean(value))
    .map(([name]) => name);

  const metrics = {
    sectionCount: sectionNames.length,
    figureCount: figures.length,
    tableCount: tables.length,
    textLength: typeof content.content === 'string'
      ? content.content.length
      : typeof content.text === 'string'
        ? content.text.length
        : 0
  };

  return {
    contentLevel,
    label: coverageLabel(contentLevel),
    detail: coverageDetail(contentLevel, metrics),
    source: provenance.source || null,
    warning: provenance.warning || null,
    retrievedAt: provenance.retrievedAt || null,
    sectionNames,
    metrics,
    hasFullText: contentLevel === 'full_text',
    hasStructuredSections: metrics.sectionCount > 0,
    hasVisualEvidence: metrics.figureCount > 0 || metrics.tableCount > 0
  };
}

function coverageLabel(contentLevel) {
  const labels = {
    full_text: 'Full text',
    abstract_only: 'Abstract only',
    metadata_only: 'Metadata only',
    unknown: 'Unknown coverage'
  };

  return labels[contentLevel] || normalizeLabel(contentLevel);
}

function coverageDetail(contentLevel, metrics) {
  if (contentLevel === 'full_text') {
    return `${metrics.sectionCount} sections, ${metrics.figureCount} figures, ${metrics.tableCount} tables`;
  }

  if (contentLevel === 'abstract_only') {
    return 'Extraction is limited to abstract and metadata';
  }

  if (contentLevel === 'metadata_only') {
    return 'Extraction is limited to metadata fields';
  }

  return 'Source coverage is not reported';
}

function normalizeLabel(value) {
  return String(value || 'unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

module.exports = {
  summarizeSourceCoverage,
  coverageLabel,
  coverageDetail
};
