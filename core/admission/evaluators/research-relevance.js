/**
 * Research Relevance Evaluator
 * Uses LLM to assess if a source is research-relevant
 */

class ResearchRelevanceEvaluator {
  constructor(llm) {
    this.llm = llm;
  }

  async score(input, metadata = {}) {
    const prompt = `Evaluate if this input represents research-relevant content that should be processed by a research intelligence platform.

Input: ${input}
Type: ${metadata.type || 'unknown'}
Title: ${metadata.title || 'N/A'}

A research-relevant source is one that contains:
- Scientific claims, methods, or evidence
- Datasets with research variables
- Computational models or workflows
- Technical documentation for research tools
- Reports with analysis or findings

NOT research-relevant:
- Pure marketing or advertising
- Personal blogs without technical content
- Social media posts without evidence
- Duplicate/repost of existing content

Return JSON only:
{
  "isResearch": true/false,
  "researchType": "paper|dataset|code|report|news|documentation|other",
  "relevanceScore": 0.0-1.0,
  "domain": "primary research domain if applicable, null otherwise",
  "informationDensity": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const result = await this.llm.callJSON(prompt);
      return {
        isResearch: result.isResearch !== false,
        researchType: result.researchType || 'other',
        score: Math.max(0, Math.min(1, result.relevanceScore || 0.5)),
        domain: result.domain || null,
        informationDensity: Math.max(0, Math.min(1, result.informationDensity || 0.5)),
        reasoning: result.reasoning || 'No reasoning provided'
      };
    } catch (err) {
      // Fallback: assume moderate relevance if LLM fails
      return {
        isResearch: true,
        researchType: 'unknown',
        score: 0.5,
        domain: null,
        informationDensity: 0.5,
        reasoning: 'LLM evaluation failed, assuming moderate relevance'
      };
    }
  }
}

module.exports = ResearchRelevanceEvaluator;