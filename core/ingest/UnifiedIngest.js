/**
 * Unified Ingest Engine
 * AI-native research import: understand → fetch → decompose → store
 */

const llm = require('../utils/llm');
const { Entity } = require('../registry/TripleStore');
const { ENTITY_TYPES, RELATION_TYPES } = require('../registry/ontology');
const ConnectorRegistry = require('../connectors/ConnectorRegistry');

class UnifiedIngest {
  constructor(store, eventLog) {
    this.store = store;
    this.eventLog = eventLog;

    // Initialize connector registry with LLM config
    const config = {
      githubToken: llm.getGitHubToken(),
      openAlexKey: llm.getOpenAlexKey()
    };
    this.connectorRegistry = new ConnectorRegistry(config);
  }

  /**
   * Main ingest pipeline
   */
  async ingest(input, options = {}) {
    console.log(`[Ingest] Processing: ${input.substring(0, 100)}...`);

    // Step 1: Understand what the input is
    const understanding = await this.understand(input);
    console.log(`[Ingest] Understood as: ${understanding.type} - ${understanding.summary}`);

    // Step 2: Fetch complete content
    const content = await this.fetch(understanding);
    console.log(`[Ingest] Fetched content: ${content.type}`);

    // Step 3: Decompose into entities and triples
    const { entities, triples } = await this.decompose(content);
    console.log(`[Ingest] Decomposed: ${entities.length} entities, ${triples.length} relations`);

    // Step 4: Store in registry
    const entityIds = [];
    for (const entityData of entities) {
      const entity = new Entity(
        entityData.type,
        entityData.attributes,
        { source: input, extractedBy: 'UnifiedIngest', ...entityData.metadata }
      );
      const id = this.store.addEntity(entity);
      entityIds.push(id);
    }

    // Step 5: Create triples
    const tripleIds = [];
    for (const tripleData of triples) {
      try {
        // Find entity IDs by matching names
        const subjectId = this._findEntityId(tripleData.subject, entityIds);
        const objectId = this._findEntityId(tripleData.object, entityIds);

        if (subjectId && objectId) {
          const tripleId = this.store.addTriple(
            subjectId,
            tripleData.predicate,
            objectId,
            { source: input, extractedBy: 'UnifiedIngest' }
          );
          tripleIds.push(tripleId);
        }
      } catch (err) {
        console.warn(`[Ingest] Failed to create triple: ${err.message}`);
      }
    }

    // Step 6: Record event
    await this.eventLog.record('ingest', entityIds, {
      input,
      understanding: understanding.summary,
      entitiesCreated: entityIds.length,
      triplesCreated: tripleIds.length
    });

    return {
      input,
      understanding: understanding.summary,
      entityIds,
      tripleIds,
      stats: {
        entities: entityIds.length,
        triples: tripleIds.length
      }
    };
  }

  /**
   * Step 1: Understand input intent
   */
  async understand(input) {
    // Quick pattern matching
    if (input.includes('github.com')) {
      return {
        type: 'github',
        target: input,
        confidence: 'high',
        summary: 'GitHub repository'
      };
    }

    if (/^10\.\d{4,}\//.test(input)) {
      return {
        type: 'doi',
        target: input,
        confidence: 'high',
        summary: 'DOI reference'
      };
    }

    if (input.startsWith('http://') || input.startsWith('https://')) {
      return {
        type: 'url',
        target: input,
        confidence: 'medium',
        summary: 'Web URL'
      };
    }

    // Use LLM for ambiguous cases
    const prompt = `User input: "${input}"

Determine the intent and return JSON:
{
  "type": "paper|github|dataset|text|url|unknown",
  "summary": "One sentence: what is this?",
  "target": "The input verbatim"
}

Return JSON only.`;

    try {
      const result = await llm.callJSON(prompt);
      result.confidence = 'medium';
      return result;
    } catch (err) {
      console.warn(`[Ingest] LLM understanding failed: ${err.message}`);
      return {
        type: 'text',
        target: input,
        confidence: 'low',
        summary: 'Plain text input'
      };
    }
  }

  /**
   * Step 2: Fetch content using ConnectorRegistry
   */
  async fetch(understanding) {
    try {
      // Use ConnectorRegistry to automatically find and use appropriate connector
      return await this.connectorRegistry.fetch(understanding.target);
    } catch (err) {
      // Fallback to text if connector fails
      console.warn(`[Ingest] Connector failed: ${err.message}`);
      return { type: 'text', content: understanding.target };
    }
  }

  /**
   * Step 3: Decompose content into entities and triples
   */
  async decompose(content) {
    const prompt = this._buildDecomposePrompt(content);

    try {
      const result = await llm.callJSON(prompt, { maxTokens: 8000 });

      return {
        entities: result.entities || [],
        triples: result.triples || []
      };
    } catch (err) {
      console.warn(`[Ingest] LLM decomposition failed: ${err.message}`);
      // Fallback to rule-based
      return this._decomposeRuleBased(content);
    }
  }

  /**
   * Build decomposition prompt
   */
  _buildDecomposePrompt(content) {
    let context = '';

    if (content.type === 'paper') {
      context = `Paper: ${content.title}
Authors: ${content.authors.map(a => a.name).join(', ')}
Abstract: ${content.abstract}
Keywords: ${content.keywords.join(', ')}
Year: ${content.year}`;
    } else if (content.type === 'github') {
      context = `GitHub Repository: ${content.name}
Description: ${content.description || 'None'}
README excerpt: ${content.readme ? content.readme.substring(0, 2000) : 'No README'}
Language: ${content.language || 'Unknown'}
Topics: ${content.topics.join(', ')}`;
    } else {
      context = `Content: ${JSON.stringify(content).substring(0, 2000)}`;
    }

    return `You are decomposing research content into structured objects.

${context}

Extract research entities and their relationships. Return JSON:
{
  "entities": [
    {
      "type": "Paper|ResearchQuestion|Hypothesis|Claim|Dataset|Model|Method|Region|TimeRange|Experiment|Metric|Code|Figure",
      "attributes": {
        // REQUIRED fields by type:
        // ResearchQuestion: {text: string, domain: string}
        // Hypothesis: {statement: string}
        // Claim: {statement: string}
        // Paper: {title: string, authors: array, abstract: string, year: number}
        // Dataset: {name: string, format: string, variables: array}
        // Model: {name: string, type: string}
        // Method: {name: string, category: string}
        // Region: {name: string, type: string, bbox: [west, south, east, north]}
        // TimeRange: {start: string, end: string}
        // Experiment: {name: string}
        // Metric: {name: string, value: number}
        // Code: {name: string, language: string}
        // Figure: {caption: string}
      },
      "name": "Unique name for cross-referencing in triples"
    }
  ],
  "triples": [
    {
      "subject": "entity name",
      "predicate": "proposes|uses|applies|studies|covers|produces|supports|derives_from|evaluated_by",
      "object": "another entity name"
    }
  ]
}

CRITICAL:
- ALWAYS include ALL required fields for each entity type
- Extract 5-15 entities total
- Include Region with bbox when location is mentioned
- Include TimeRange when time period is mentioned
- Use consistent entity names in triples

Return JSON only.`;
  }

  /**
   * Rule-based decomposition fallback
   */
  _decomposeRuleBased(content) {
    const entities = [];
    const triples = [];

    if (content.type === 'paper') {
      // Create Paper entity
      entities.push({
        type: ENTITY_TYPES.PAPER,
        name: content.title,
        attributes: {
          title: content.title,
          doi: content.doi,
          authors: content.authors,
          year: content.year,
          abstract: content.abstract,
          keywords: content.keywords
        }
      });

      // If keywords suggest a domain, create ResearchQuestion
      if (content.keywords && content.keywords.length > 0) {
        entities.push({
          type: ENTITY_TYPES.RESEARCH_QUESTION,
          name: `Question about ${content.keywords[0]}`,
          attributes: {
            text: `Research about ${content.keywords.slice(0, 3).join(', ')}`,
            domain: content.keywords[0]
          }
        });

        triples.push({
          subject: content.title,
          predicate: RELATION_TYPES.PROPOSES,
          object: `Question about ${content.keywords[0]}`
        });
      }
    } else if (content.type === 'github') {
      // Create Code entity
      entities.push({
        type: ENTITY_TYPES.CODE,
        name: content.name,
        attributes: {
          repo: content.url,
          language: content.language,
          description: content.description
        }
      });
    }

    return { entities, triples };
  }

  /**
   * Helper: Find entity ID by name
   */
  _findEntityId(name, entityIds) {
    for (const id of entityIds) {
      const entity = this.store.getEntity(id);
      if (!entity) continue;

      const displayName = entity.getDisplayName();
      if (displayName === name || entity.attributes.name === name || entity.attributes.title === name) {
        return id;
      }
    }
    return null;
  }

  /**
   * Helper: Find entity ID by name
   */
  _findEntityId(name, entityIds) {
    for (const id of entityIds) {
      const entity = this.store.getEntity(id);
      if (!entity) continue;

      const displayName = entity.getDisplayName();
      if (displayName === name || entity.attributes.name === name || entity.attributes.title === name) {
        return id;
      }
    }
    return null;
  }
}

module.exports = UnifiedIngest;
