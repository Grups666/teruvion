/**
 * URLConnector - Fetches content from generic URLs
 */

const BaseConnector = require('./BaseConnector');
const cheerio = require('cheerio');

class URLConnector extends BaseConnector {
  /**
   * Check if input is a URL
   */
  canHandle(input) {
    return input.startsWith('http://') || input.startsWith('https://');
  }

  /**
   * Fetch content from URL
   */
  async fetch(input) {
    const response = await fetch(input, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Teruvion/0.12.86 (https://teruvion.com)'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const html = await response.text();
    const normalized = normalizeHtml(input, html);

    return {
      type: 'url',
      url: input,
      title: normalized.title,
      content: normalized.content,
      metadata: {
        title: normalized.title,
        description: normalized.description,
        canonicalUrl: normalized.canonicalUrl,
        resources: normalized.resources,
        sourceLevel: normalized.content.length > 300 ? 'readable_text' : 'html_only'
      }
    };
  }
}

function normalizeHtml(input, html) {
  const $ = cheerio.load(html || '');
  $('script, style, noscript, svg, canvas, iframe, nav, footer, header, form').remove();

  const title = cleanText(
    $('meta[property="og:title"]').attr('content')
    || $('meta[name="twitter:title"]').attr('content')
    || $('title').first().text()
    || input
  );
  const description = cleanText(
    $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || $('meta[name="twitter:description"]').attr('content')
    || ''
  );
  const canonicalUrl = resolveUrl($('link[rel="canonical"]').attr('href'), input) || input;
  const bodyText = cleanText(
    [
      $('main').text(),
      $('article').text(),
      $('[role="main"]').text(),
      $('body').text()
    ].filter(Boolean).sort((a, b) => b.length - a.length)[0] || ''
  );
  const resources = [];
  $('a[href]').each((_, element) => {
    const rawHref = $(element).attr('href');
    const href = resolveUrl(rawHref, input);
    if (!href) return;
    resources.push({
      label: cleanText($(element).text()) || hostLabel(href),
      url: href,
      type: classifyLink(href),
      context: cleanText($(element).parent().text()).slice(0, 500)
    });
  });

  return {
    title,
    description,
    canonicalUrl,
    content: [title, description, bodyText].filter(Boolean).join('\n\n').slice(0, 50000),
    resources: dedupeResources(resources).slice(0, 80)
  };
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function resolveUrl(value, base) {
  if (!value || /^mailto:|^tel:|^javascript:/i.test(value)) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'linked resource';
  }
}

function classifyLink(url) {
  const lower = String(url || '').toLowerCase();
  if (/(zenodo|figshare|dataverse|dryad|pangaea|osf\.io|huggingface\.co\/datasets)/.test(lower)) return 'dataset';
  if (/github\.com/.test(lower)) return 'repository';
  if (/doi\.org/.test(lower)) return 'doi';
  if (/\.(geojson|json|csv|tsv|zip|tiff?|gpkg|nc)(\?|#|$)/.test(lower)) return 'dataset';
  return 'external';
}

function dedupeResources(resources) {
  const seen = new Set();
  return resources.filter(resource => {
    if (!resource.url || seen.has(resource.url)) return false;
    seen.add(resource.url);
    return true;
  });
}

module.exports = URLConnector;
