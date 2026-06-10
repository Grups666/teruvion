/**
 * Information Density Evaluator
 * Assesses content richness without LLM (heuristic-based)
 */

class InformationDensityEvaluator {
  score(metadata = {}) {
    let density = 0;
    const factors = [];

    // Check for content indicators
    if (metadata.abstract || metadata.description) {
      const textLength = (metadata.abstract || metadata.description || '').length;
      if (textLength > 5000) {
        density += 0.3;
        factors.push('long_abstract');
      } else if (textLength > 1000) {
        density += 0.2;
        factors.push('medium_abstract');
      } else if (textLength > 100) {
        density += 0.1;
        factors.push('short_abstract');
      }
    }

    // Check for structured data
    if (metadata.sections && metadata.sections.length > 0) {
      density += 0.2;
      factors.push('has_sections');
    }

    if (metadata.keywords && metadata.keywords.length > 0) {
      density += 0.1;
      factors.push('has_keywords');
    }

    if (metadata.authors && metadata.authors.length > 0) {
      density += 0.1;
      factors.push('has_authors');
    }

    // Check for code indicators
    if (metadata.language) {
      density += 0.15;
      factors.push('has_language');
    }

    if (metadata.tree && metadata.tree.length > 10) {
      density += 0.15;
      factors.push('large_tree');
    } else if (metadata.tree && metadata.tree.length > 0) {
      density += 0.1;
      factors.push('has_tree');
    }

    if (metadata.readme && metadata.readme.length > 500) {
      density += 0.15;
      factors.push('has_readme');
    }

    // Check for dataset indicators
    if (metadata.variables && metadata.variables.length > 0) {
      density += 0.2;
      factors.push('has_variables');
    }

    if (metadata.spatialCoverage || metadata.temporalCoverage) {
      density += 0.15;
      factors.push('has_coverage');
    }

    // Check for citation/references
    if (metadata.citationCount > 0) {
      density += 0.1;
      factors.push('has_citations');
    }

    if (metadata.references && metadata.references.length > 0) {
      density += 0.1;
      factors.push('has_references');
    }

    // Cap at 1.0
    density = Math.min(1.0, density);

    return {
      score: density,
      factors,
      level: density >= 0.7 ? 'high' : density >= 0.4 ? 'medium' : 'low'
    };
  }
}

module.exports = InformationDensityEvaluator;