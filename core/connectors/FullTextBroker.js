/**
 * FullTextBroker - 合规全文获取管道
 *
 * 负责获取文献全文，优先级：HTML > XML > PDF > Abstract
 * 通过Unpaywall/OpenAlex/PMC找OA入口，记录provenance
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

class FullTextBroker {
  constructor(config = {}) {
    this.config = config;
    this.email = config.email || 'research@teruvion.org'; // Unpaywall requires email
  }

  /**
   * 获取文献全文（合规）
   * 返回：结构化sections + provenance
   */
  async fetchFullText(doi, metadata = {}) {
    console.log('[FullTextBroker] Fetching full text for:', doi);

    // Step 1: 找OA入口
    const accessPlan = await this._locateOA(doi, metadata);

    // Step 2: 按优先级尝试获取
    for (const source of accessPlan.sources) {
      try {
        console.log(`[FullTextBroker] Trying ${source.type}:`, source.url);

        const content = await this._fetchFromSource(source);
        const structured = await this._parseStructure(content, source.type);

        // Step 3: 验证是否真的获取全文
        if (this._validateFullText(structured)) {
          console.log(`[FullTextBroker] Successfully fetched ${source.type}`);

          return {
            level: 'full_text',
            sections: structured.sections,
            figures: structured.figures || [],
            tables: structured.tables || [],
            references: structured.references || [],
            totalLength: structured.totalLength,
            provenance: {
              source: source.type,
              url: source.url,
              license: source.license,
              oaStatus: accessPlan.oaStatus,
              retrievedAt: new Date().toISOString(),
              doi: doi
            }
          };
        }
      } catch (err) {
        console.warn(`[FullTextBroker] Source ${source.type} failed:`, err.message);
        continue;
      }
    }

    // Fallback to abstract only
    console.log('[FullTextBroker] Full text unavailable, using abstract');

    return {
      level: 'abstract_only',
      sections: {
        abstract: metadata.abstract || metadata.title || ''
      },
      figures: [],
      tables: [],
      references: [],
      totalLength: (metadata.abstract || '').length,
      provenance: {
        source: 'openalex_abstract',
        warning: 'Full text unavailable. Analysis limited to abstract and metadata.',
        doi: doi,
        retrievedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 找OA入口（Unpaywall + OpenAlex�?   */
  async _locateOA(doi, metadata) {
    const sources = [];
    let oaStatus = 'unknown';

    // 1. Try Unpaywall API
    try {
      const unpaywallUrl = `https://api.unpaywall.org/v2/${doi}?email=${this.email}`;
      const response = await fetch(unpaywallUrl, {
        headers: { 'User-Agent': 'Teruvion/0.1.0' },
        timeout: 10000
      });

      if (response.ok) {
        const oaData = await response.json();
        oaStatus = oaData.is_oa ? (oaData.oa_status || 'oa') : 'closed';

        // Best OA location (PDF)
        if (oaData.best_oa_location?.url_for_pdf) {
          sources.push({
            type: 'oa_pdf',
            url: oaData.best_oa_location.url_for_pdf,
            license: oaData.best_oa_location.license,
            version: oaData.best_oa_location.version
          });
        }

        // Best OA location (HTML)
        if (oaData.best_oa_location?.url) {
          sources.push({
            type: 'oa_html',
            url: oaData.best_oa_location.url,
            license: oaData.best_oa_location.license,
            version: oaData.best_oa_location.version
          });
        }

        console.log('[FullTextBroker] Unpaywall OA status:', oaStatus);
      }
    } catch (err) {
      console.warn('[FullTextBroker] Unpaywall lookup failed:', err.message);
    }

    // 2. OpenAlex best_oa_location (fallback)
    if (metadata.best_oa_location?.url) {
      sources.push({
        type: 'openalex_oa',
        url: metadata.best_oa_location.url,
        license: metadata.best_oa_location.license || 'unknown'
      });
    }

    sources.push(this._doiLandingPageSource(doi));

    // 3. PMC for biomedical
    if (this._isPMC(doi, metadata)) {
      const pmcId = await this._resolvePMCId(doi);
      if (pmcId) {
        sources.push({
          type: 'pmc_xml',
          url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}`,
          license: 'open-access'
        });
      }
    }

    // Sort by priority: publisher/HTML > XML > PDF
    sources.sort((a, b) => {
      const priority = { publisher_html: 1, oa_html: 2, pmc_xml: 3, openalex_oa: 4, oa_pdf: 5 };
      return (priority[a.type] || 99) - (priority[b.type] || 99);
    });

    return { sources: this._dedupeSources(sources.filter(Boolean)), oaStatus };
  }

  _doiLandingPageSource(doi) {
    const normalized = (doi || '').replace(/^https?:\/\/doi\.org\//i, '');
    if (!normalized) return null;

    return {
      type: 'publisher_html',
      url: `https://doi.org/${normalized}`,
      license: 'publisher-page',
      version: 'published'
    };
  }

  _dedupeSources(sources) {
    const seen = new Set();
    const unique = [];

    for (const source of sources) {
      const key = `${source.type}:${source.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(source);
    }

    return unique;
  }

  /**
   * 从source抓取内容
   */
  async _fetchFromSource(source) {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'Teruvion/0.1.0 (https://teruvion.org)',
        'Accept': 'text/html,application/xml,application/pdf'
      },
      timeout: 15000,
      follow: 20
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // HTML
    if (contentType.includes('text/html')) {
      return {
        type: 'html',
        text: await response.text()
      };
    }

    // XML/JATS
    if (contentType.includes('xml')) {
      return {
        type: 'xml',
        text: await response.text()
      };
    }

    // PDF (需要额外解�?
    if (contentType.includes('pdf')) {
      // For MVP, we'll just note PDF availability but not parse
      // GROBID integration would be needed for proper PDF parsing
      console.log('[FullTextBroker] PDF detected, would need GROBID parsing');
      throw new Error('PDF parsing not implemented yet - try HTML source');
    }

    // Default to text
    return {
      type: 'text',
      text: await response.text()
    };
  }

  /**
   * 解析结构（HTML/XML �?sections�?   */
  async _parseStructure(content, sourceType) {
    if (content.type === 'html') {
      return this._parseHTMLStructure(content.text);
    }

    if (content.type === 'xml') {
      return this._parseXMLStructure(content.text);
    }

    // Fallback: try to detect sections in plain text
    return this._parseTextStructure(content.text);
  }

  /**
   * 解析HTML结构（section detection�?   */
  _parseHTMLStructure(html) {
    const $ = cheerio.load(html);
    const sections = {};
    const figures = [];
    const tables = [];

    // Common section patterns (not hardcoded keywords, just HTML structure hints)
    const sectionSelectors = [
      'section[id]',
      'div[section]',
      'h1, h2, h3',
      '.article-section',
      '.section-title'
    ];

    // Extract abstract from common scholarly HTML metadata or containers.
    const abstract = this._cleanText(
      $('abstract, .abstract, #abstract, [data-test="abstract"], [role="doc-abstract"]').first().text()
    );
    if (abstract) {
      sections.abstract = abstract;
    }

    // Extract sections based on heading text
    $('h1, h2, h3').each((i, el) => {
      const heading = this._normalizeSectionName($(el).text());
      let content = this._cleanText($(el).nextUntil('h1, h2, h3').text());

      if (content.length < 100) {
        content = this._cleanText(
          $(el)
            .closest('section, [data-container-section], [role="doc-abstract"]')
            .find('[data-test="section-content"], p, li')
            .text()
        );
      }

      const minSectionLength = heading === 'abstract' ? 20 : 100;

      // Detect section type from heading (LLM will classify later)
      if (heading && content.length > minSectionLength && !sections[heading]) {
        // Store with original heading as key
        sections[heading] = content.substring(0, 10000); // Limit per section
      }
    });

    // Extract figures
    $('figure, .figure').each((i, el) => {
      const caption = $(el).find('figcaption, .caption').text().trim();
      const label = $(el).find('label, .label').text().trim();
      if (caption) {
        figures.push({
          number: label || `Figure ${i + 1}`,
          caption: caption
        });
      }
    });

    // Extract tables
    $('table, .table').each((i, el) => {
      const caption = $(el).find('caption, .caption').text().trim();
      tables.push({
        number: `Table ${i + 1}`,
        caption: caption
      });
    });

    // Calculate total length
    const totalLength = Object.values(sections).reduce((sum, s) => sum + s.length, 0);

    return {
      sections,
      figures,
      tables,
      references: [], // Would need reference parser
      totalLength
    };
  }

  _normalizeSectionName(text) {
    return this._cleanText(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  _cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * 解析XML/JATS结构（学术论文标准格式）
   */
  _parseXMLStructure(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const sections = {};
    const figures = [];

    // JATS standard tags
    sections.abstract = $('abstract').text().trim();
    sections.introduction = $('intro, section[sec-type="intro"]').text().trim();
    sections.methods = $('methods, section[sec-type="methods"]').text().trim();
    sections.results = $('results, section[sec-type="results"]').text().trim();
    sections.discussion = $('discussion, section[sec-type="discussion"]').text().trim();
    sections.dataAvailability = $('data-availability, availability').text().trim();
    sections.codeAvailability = $('code-availability').text().trim();

    // Extract figures
    $('fig').each((i, el) => {
      figures.push({
        number: $(el).attr('id') || `Figure ${i + 1}`,
        caption: $(el).find('caption').text().trim()
      });
    });

    const totalLength = Object.values(sections).reduce((sum, s) => sum + (s || '').length, 0);

    return {
      sections,
      figures,
      tables: [],
      references: [],
      totalLength
    };
  }

  /**
   * 纯文本结构解析（fallback�?   */
  _parseTextStructure(text) {
    const sections = {};

    // Just store whole text as 'content'
    sections.content = text.substring(0, 50000);

    return {
      sections,
      figures: [],
      tables: [],
      references: [],
      totalLength: text.length
    };
  }

  /**
   * 验证是否真的获取全文
   */
  _validateFullText(structured) {
    // Must have substantial content
    if (structured.totalLength < 10000) {
      console.log('[FullTextBroker] Content too short:', structured.totalLength);
      return false;
    }

    // Should have at least Methods or Results section
    const hasMethods = structured.sections.methods ||
                       Object.keys(structured.sections).some(k => k.includes('method'));
    const hasResults = structured.sections.results ||
                       Object.keys(structured.sections).some(k => k.includes('result'));

    if (!hasMethods && !hasResults) {
      console.log('[FullTextBroker] Missing Methods/Results sections');
      return false;
    }

    return true;
  }

  /**
   * 判断是否PMC文章
   */
  _isPMC(doi, metadata) {
    return metadata.venue?.toLowerCase().includes('pmc') ||
           metadata.venue?.toLowerCase().includes('pubmed') ||
           metadata.host?.display_name?.toLowerCase().includes('pmc') ||
           doi.includes('pmc');
  }

  /**
   * 解析PMC ID
   */
  async _resolvePMCId(doi) {
    try {
      const url = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?doi=${doi}&format=json`;
      const response = await fetch(url, { timeout: 5000 });

      if (response.ok) {
        const data = await response.json();
        return data.records?.[0]?.pmcid;
      }
    } catch (err) {
      console.warn('[FullTextBroker] PMC ID resolution failed:', err.message);
    }

    return null;
  }
}

module.exports = FullTextBroker;
