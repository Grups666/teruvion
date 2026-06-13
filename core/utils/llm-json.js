/**
 * Shared JSON extraction/repair helpers for LLM and agent outputs.
 *
 * These helpers intentionally repair only narrow, common transport artifacts:
 * markdown fences, BOMs, trailing commas, and non-printable control characters.
 * They do not infer missing keys or rewrite malformed semantic content.
 */

function extractJsonObject(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const unfenced = raw
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) return unfenced;
  return unfenced.slice(start, end + 1);
}

function parseLLMJson(text = '', { attachWarning = true } = {}) {
  const jsonText = extractJsonObject(text);

  try {
    return JSON.parse(jsonText);
  } catch (initialError) {
    const repaired = jsonText
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u0000-\u001F]+/g, char => (char === '\n' || char === '\r' || char === '\t') ? char : '');

    try {
      const parsed = JSON.parse(repaired);
      if (attachWarning && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsed.schemaWarnings = [
          ...(Array.isArray(parsed.schemaWarnings) ? parsed.schemaWarnings : []),
          `LLM JSON repaired after parse error: ${initialError.message}`
        ];
      }
      return parsed;
    } catch {
      throw initialError;
    }
  }
}

module.exports = {
  extractJsonObject,
  parseLLMJson
};
