/**
 * Section Parser for Source Text
 *
 * Parses source text into structured sections with:
 * - Section boundaries (start/end positions)
 * - Section types (abstract, methods, results, etc.)
 * - Chunk management for LLM processing
 *
 * This enables:
 * 1. Section-aware LLM extraction
 * 2. Precise span provenance
 * 3. Chunk-level processing for long documents
 */

class SectionParser {
  constructor() {
    // Common section headers in academic papers
    this.sectionPatterns = [
      { pattern: /^#\s+(abstract|摘要)/i, type: 'abstract', priority: 1 },
      { pattern: /^#\s+(introduction|引言|背景)/i, type: 'introduction', priority: 2 },
      { pattern: /^#\s+(related\s*work|literature\s*review|相关工作)/i, type: 'related_work', priority: 3 },
      { pattern: /^#\s+(methods?|methodology|方法)/i, type: 'methods', priority: 4 },
      { pattern: /^#\s+(data|datasets?|数据)/i, type: 'data', priority: 5 },
      { pattern: /^#\s+(study\s*area|study\s*region|研究区域)/i, type: 'study_area', priority: 6 },
      { pattern: /^#\s+(results?|结果)/i, type: 'results', priority: 7 },
      { pattern: /^#\s+(discussion|讨论)/i, type: 'discussion', priority: 8 },
      { pattern: /^#\s+(conclusions?|结论)/i, type: 'conclusion', priority: 9 },
      { pattern: /^#\s+(references|参考文献)/i, type: 'references', priority: 10 },
      { pattern: /^##\s+(.+)/i, type: 'subsection', priority: 11 },
      { pattern: /^###\s+(.+)/i, type: 'subsubsection', priority: 12 },
    ];

    // For reports and policy documents
    this.reportPatterns = [
      { pattern: /^#\s+(executive\s*summary|摘要)/i, type: 'executive_summary', priority: 1 },
      { pattern: /^#\s+(key\s*findings|主要发现)/i, type: 'key_findings', priority: 2 },
      { pattern: /^#\s+(recommendations?|建议)/i, type: 'recommendations', priority: 3 },
      { pattern: /^#\s+(interventions?|干预)/i, type: 'interventions', priority: 4 },
      { pattern: /^#\s+(governance|治理)/i, type: 'governance', priority: 5 },
    ];

    // For news articles
    this.newsPatterns = [
      { pattern: /^#\s+(overview|概览)/i, type: 'overview', priority: 1 },
      { pattern: /^#\s+(impact|影响)/i, type: 'impact', priority: 2 },
      { pattern: /^#\s+(response|响应)/i, type: 'response', priority: 3 },
      { pattern: /^#\s+(causes?|原因)/i, type: 'causes', priority: 4 },
    ];

    // Section importance for extraction (higher = more important)
    this.sectionImportance = {
      abstract: 0.9,
      methods: 0.95,
      data: 0.9,
      study_area: 0.85,
      results: 0.85,
      discussion: 0.7,
      introduction: 0.6,
      conclusion: 0.6,
      executive_summary: 0.95,
      key_findings: 0.9,
      recommendations: 0.85,
      interventions: 0.9,
      governance: 0.85,
      impact: 0.9,
      overview: 0.85,
      response: 0.8,
      causes: 0.75,
      references: 0.2,
    };
  }

  /**
   * Parse source text into sections
   * @param {string} text - Full source text
   * @param {string} sourceType - Type of source (Paper, Report, News, etc.)
   * @returns {Object} Parsed sections with boundaries
   */
  parse(text, sourceType = 'Paper') {
    if (!text) {
      return { sections: [], chunks: [], totalLength: 0 };
    }

    const lines = text.split('\n');
    const sections = [];
    let currentSection = null;
    let position = 0;

    // Select appropriate patterns based on source type
    const patterns = this._getPatternsForSource(sourceType);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStart = position;
      const lineEnd = position + line.length;
      position = lineEnd + 1; // +1 for newline

      // Check if this line is a section header
      const matchedPattern = this._matchHeader(line, patterns);

      if (matchedPattern) {
        // Save previous section
        if (currentSection) {
          currentSection.endPosition = lineStart - 1;
          currentSection.endLine = i - 1;
          currentSection.text = text.substring(currentSection.startPosition, currentSection.endPosition);
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          type: matchedPattern.type,
          title: line.replace(/^#+\s*/, '').trim(),
          priority: matchedPattern.priority,
          importance: this.sectionImportance[matchedPattern.type] || 0.5,
          startLine: i,
          startPosition: lineEnd + 1,
          endLine: null,
          endPosition: null,
          text: null
        };
      }
    }

    // Save last section
    if (currentSection) {
      currentSection.endPosition = text.length;
      currentSection.endLine = lines.length - 1;
      currentSection.text = text.substring(currentSection.startPosition, currentSection.endPosition);
      sections.push(currentSection);
    }

    // If no sections found, treat entire text as one section
    if (sections.length === 0) {
      sections.push({
        type: 'content',
        title: 'Content',
        priority: 1,
        importance: 0.5,
        startLine: 0,
        startPosition: 0,
        endLine: lines.length - 1,
        endPosition: text.length,
        text: text
      });
    }

    // Generate chunks for LLM processing
    const chunks = this._generateChunks(sections, text);

    return {
      sections,
      chunks,
      totalLength: text.length,
      sourceType,
      stats: {
        totalSections: sections.length,
        totalChunks: chunks.length,
        avgChunkSize: chunks.length > 0 ? Math.round(text.length / chunks.length) : 0
      }
    };
  }

  /**
   * Get header patterns for source type
   */
  _getPatternsForSource(sourceType) {
    const basePatterns = [...this.sectionPatterns];

    if (sourceType === 'Report' || sourceType === 'Policy') {
      return [...this.reportPatterns, ...basePatterns];
    }

    if (sourceType === 'News') {
      return [...this.newsPatterns, ...basePatterns];
    }

    return basePatterns;
  }

  /**
   * Match a line against header patterns
   */
  _matchHeader(line, patterns) {
    for (const { pattern, type, priority } of patterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          type,
          priority,
          matchedText: match[0]
        };
      }
    }
    return null;
  }

  /**
   * Generate chunks for LLM processing
   * Each chunk contains one or more sections, up to maxChunkSize
   * @param {Array} sections - Parsed sections
   * @param {string} fullText - Full source text
   * @param {number} maxChunkSize - Maximum characters per chunk (default 8000)
   */
  _generateChunks(sections, fullText, maxChunkSize = 8000) {
    const chunks = [];
    let currentChunk = null;

    // Sort sections by importance for prioritization
    const sortedSections = [...sections].sort((a, b) => b.importance - a.importance);

    for (const section of sortedSections) {
      const sectionLength = section.text ? section.text.length : 0;

      if (!currentChunk) {
        currentChunk = {
          id: `chunk_${chunks.length}`,
          sections: [section.type],
          startSection: section.type,
          startPosition: section.startPosition,
          endPosition: section.endPosition,
          importance: section.importance,
          text: section.text
        };
      } else if (currentChunk.text.length + sectionLength <= maxChunkSize) {
        // Add to current chunk
        currentChunk.sections.push(section.type);
        currentChunk.endPosition = Math.max(currentChunk.endPosition, section.endPosition);
        currentChunk.text += '\n\n' + section.text;
        currentChunk.importance = Math.max(currentChunk.importance, section.importance);
      } else {
        // Save current chunk and start new one
        chunks.push(currentChunk);
        currentChunk = {
          id: `chunk_${chunks.length}`,
          sections: [section.type],
          startSection: section.type,
          startPosition: section.startPosition,
          endPosition: section.endPosition,
          importance: section.importance,
          text: section.text
        };
      }
    }

    // Save last chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    // Sort chunks by importance (most important first for LLM)
    chunks.sort((a, b) => b.importance - a.importance);

    // Add chunk index
    chunks.forEach((chunk, index) => {
      chunk.index = index;
    });

    return chunks;
  }

  /**
   * Find text span in source
   * Returns position information for provenance
   * @param {string} searchText - Text to find
   * @param {string} fullText - Full source text
   * @returns {Object|null} Span information
   */
  findSpan(searchText, fullText) {
    if (!searchText || !fullText) return null;

    // Normalize whitespace for better matching
    const normalizedSearch = searchText.trim().toLowerCase();
    const normalizedFull = fullText.toLowerCase();

    const startIndex = normalizedFull.indexOf(normalizedSearch.substring(0, 100));

    if (startIndex === -1) return null;

    // Find the actual text in original (preserving case)
    const actualText = fullText.substring(startIndex, startIndex + searchText.length);

    // Find which section this span belongs to
    const section = this._findSectionForPosition(startIndex, fullText);

    return {
      start: startIndex,
      end: startIndex + searchText.length,
      length: searchText.length,
      text: actualText,
      section: section ? section.type : 'unknown',
      sectionTitle: section ? section.title : null
    };
  }

  /**
   * Find section containing a position
   */
  _findSectionForPosition(position, fullText) {
    const parsed = this.parse(fullText);
    for (const section of parsed.sections) {
      if (position >= section.startPosition && position <= section.endPosition) {
        return section;
      }
    }
    return null;
  }

  /**
   * Validate that sourceText actually appears in source
   * @param {string} sourceText - Claimed source text
   * @param {string} fullText - Full source text
   * @param {number} threshold - Minimum match ratio (0-1)
   * @returns {Object} Validation result
   */
  validateSourceText(sourceText, fullText, threshold = 0.7) {
    if (!sourceText || !fullText) {
      return { valid: false, reason: 'Missing text' };
    }

    // Try exact match first
    const exactMatch = fullText.includes(sourceText);
    if (exactMatch) {
      return {
        valid: true,
        matchType: 'exact',
        confidence: 1.0
      };
    }

    // Try fuzzy match (normalized whitespace)
    const normalizedSource = sourceText.trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizedFull = fullText.replace(/\s+/g, ' ').toLowerCase();

    if (normalizedFull.includes(normalizedSource)) {
      return {
        valid: true,
        matchType: 'normalized',
        confidence: 0.95
      };
    }

    // Try partial match (first N characters)
    const partialLength = Math.min(100, normalizedSource.length);
    const partialSource = normalizedSource.substring(0, partialLength);

    if (normalizedFull.includes(partialSource)) {
      return {
        valid: true,
        matchType: 'partial',
        confidence: 0.7
      };
    }

    // No match found
    // Calculate similarity for diagnostic
    const words = normalizedSource.split(' ').slice(0, 20);
    const matchedWords = words.filter(w => normalizedFull.includes(w));
    const similarity = matchedWords.length / words.length;

    return {
      valid: similarity >= threshold,
      matchType: 'similarity',
      confidence: similarity,
      matchedWords: matchedWords.length,
      totalWords: words.length
    };
  }
}

module.exports = SectionParser;
