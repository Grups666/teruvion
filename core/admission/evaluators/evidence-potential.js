/**
 * Evidence Potential Evaluator
 * Assesses whether a source can generate evidence chains
 */

class EvidencePotentialEvaluator {
  constructor(llm) {
    this.llm = llm;
  }

  score(metadata = {}) {
    let potential = 0;
    const indicators = [];

    // Papers have high evidence potential
    if (metadata.type === 'paper' || metadata.type === 'Paper') {
      potential += 0.4;
      indicators.push('paper_type');
    }

    // Code repos with tests have evidence potential
    if (metadata.type === 'github' || metadata.type === 'Code') {
      potential += 0.3;
      indicators.push('code_type');
      if (metadata.hasTests || metadata.tree?.some(f => f.includes('test'))) {
        potential += 0.15;
        indicators.push('has_tests');
      }
    }

    // Datasets with variables can support evidence
    if (metadata.type === 'dataset' || metadata.type === 'Dataset') {
      potential += 0.3;
      indicators.push('dataset_type');
    }

    // Reports can contain findings
    if (metadata.type === 'report' || metadata.type === 'Report') {
      potential += 0.25;
      indicators.push('report_type');
    }

    // News has lower evidence potential
    if (metadata.type === 'news' || metadata.type === 'News') {
      potential += 0.1;
      indicators.push('news_type');
    }

    // Content with methods section
    if (metadata.sections?.methods || metadata.hasMethods) {
      potential += 0.2;
      indicators.push('has_methods');
    }

    // Content with results section
    if (metadata.sections?.results || metadata.hasResults) {
      potential += 0.2;
      indicators.push('has_results');
    }

    // Content with figures/tables
    if (metadata.figures?.length > 0 || metadata.tables?.length > 0) {
      potential += 0.15;
      indicators.push('has_figures_tables');
    }

    // Content with quantitative data
    if (metadata.metrics || metadata.performance) {
      potential += 0.15;
      indicators.push('has_metrics');
    }

    // Cap at 1.0
    potential = Math.min(1.0, potential);

    return {
      score: potential,
      indicators,
      canGenerateChains: potential >= 0.3,
      expectedChainDepth: potential >= 0.6 ? 'deep' : potential >= 0.3 ? 'shallow' : 'none'
    };
  }
}

module.exports = EvidencePotentialEvaluator;