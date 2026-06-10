/**
 * Exporter - Export projects to standardized format
 * Creates exportable packages with entities, triples, evidence chains, and metadata
 */

const fs = require('fs').promises;
const path = require('path');

class Exporter {
  constructor(store, eventLog, projectRegistry) {
    this.store = store;
    this.eventLog = eventLog;
    this.projectRegistry = projectRegistry;
  }

  /**
   * Export a project to a directory
   */
  async exportProject(projectId, outputDir) {
    const project = this.projectRegistry.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // 1. Export project metadata
    await this._exportProjectMetadata(project, outputDir);

    // 2. Export entities
    await this._exportEntities(project, outputDir);

    // 3. Export triples
    await this._exportTriples(project, outputDir);

    // 4. Export evidence chains
    await this._exportEvidenceChains(project, outputDir);

    // 5. Export events
    await this._exportEvents(project, outputDir);

    // 6. Export geographic data
    await this._exportGeography(project, outputDir);

    // 7. Generate README
    await this._generateReadme(project, outputDir);

    return {
      projectId: project.id,
      projectName: project.name,
      outputDir,
      files: [
        'teruvion.project.json',
        'entities.json',
        'triples.json',
        'events.jsonl',
        'evidence/',
        'map.geojson',
        'README.md'
      ]
    };
  }

  /**
   * Export project metadata
   */
  async _exportProjectMetadata(project, outputDir) {
    const metadata = {
      version: '0.1.0',
      type: 'teruvion-project',
      project: project.toJSON(),
      exportedAt: new Date().toISOString(),
      exportedBy: 'Teruvion Core Engine'
    };

    await fs.writeFile(
      path.join(outputDir, 'teruvion.project.json'),
      JSON.stringify(metadata, null, 2)
    );
  }

  /**
   * Export entities
   */
  async _exportEntities(project, outputDir) {
    const entities = [];

    for (const entityId of project.entities) {
      const entity = this.store.getEntity(entityId);
      if (entity) {
        entities.push({
          id: entity.id,
          type: entity.type,
          attributes: entity.attributes,
          metadata: entity.metadata,
          verificationState: entity.verificationState,
          reviewedBy: entity.reviewedBy,
          reviewedAt: entity.reviewedAt,
          notes: entity.notes,
          createdAt: entity.createdAt
        });
      }
    }

    await fs.writeFile(
      path.join(outputDir, 'entities.json'),
      JSON.stringify({ entities }, null, 2)
    );
  }

  /**
   * Export triples
   */
  async _exportTriples(project, outputDir) {
    const triples = [];
    const projectEntitySet = new Set(project.entities);

    // Export triples involving project entities
    for (const triple of this.store.getAllTriples()) {
      if (projectEntitySet.has(triple.subject) || projectEntitySet.has(triple.object)) {
        triples.push({
          id: triple.id,
          subject: triple.subject,
          predicate: triple.predicate,
          object: triple.object,
          metadata: triple.metadata,
          verificationState: triple.verificationState,
          reviewedBy: triple.reviewedBy,
          reviewedAt: triple.reviewedAt,
          notes: triple.notes
        });
      }
    }

    await fs.writeFile(
      path.join(outputDir, 'triples.json'),
      JSON.stringify({ triples }, null, 2)
    );
  }

  /**
   * Export evidence chains
   */
  async _exportEvidenceChains(project, outputDir) {
    const evidenceDir = path.join(outputDir, 'evidence');
    await fs.mkdir(evidenceDir, { recursive: true });

    const EvidenceChain = require('../evidence/Chain');
    const evidenceChain = new EvidenceChain(this.store);

    // Export each evidence chain
    for (const chainId of project.evidenceChains) {
      const entity = this.store.getEntity(chainId);
      if (entity && (entity.type === 'Claim' || entity.type === 'Hypothesis')) {
        try {
          const chain = await evidenceChain.build(chainId);
          await fs.writeFile(
            path.join(evidenceDir, `${chainId}.json`),
            JSON.stringify(chain, null, 2)
          );
        } catch (err) {
          console.warn(`Failed to build evidence chain for ${chainId}: ${err.message}`);
        }
      }
    }

    // Also try to find claims automatically
    const claims = project.entities
      .map(id => this.store.getEntity(id))
      .filter(e => e && (e.type === 'Claim' || e.type === 'Hypothesis'));

    for (const claim of claims) {
      if (!project.evidenceChains.includes(claim.id)) {
        try {
          const chain = await evidenceChain.build(claim.id);
          await fs.writeFile(
            path.join(evidenceDir, `${claim.id}.json`),
            JSON.stringify(chain, null, 2)
          );
        } catch (err) {
          // Silent fail - claim might not have evidence chain
        }
      }
    }
  }

  /**
   * Export events
   */
  async _exportEvents(project, outputDir) {
    const projectEntitySet = new Set(project.entities);
    const relevantEvents = this.eventLog.events.filter(event =>
      event.objects.some(objId => projectEntitySet.has(objId))
    );

    const lines = relevantEvents.map(e => JSON.stringify(e)).join('\n');
    await fs.writeFile(path.join(outputDir, 'events.jsonl'), lines);
  }

  /**
   * Export geographic data
   */
  async _exportGeography(project, outputDir) {
    const features = [];

    // Export Region entities as GeoJSON
    for (const regionId of project.regions) {
      const region = this.store.getEntity(regionId);
      if (region && region.attributes.bbox) {
        const bbox = region.attributes.bbox;

        // Convert bbox to polygon
        const coordinates = [[
          [bbox[0], bbox[1]],
          [bbox[2], bbox[1]],
          [bbox[2], bbox[3]],
          [bbox[0], bbox[3]],
          [bbox[0], bbox[1]]
        ]];

        features.push({
          type: 'Feature',
          id: region.id,
          geometry: {
            type: 'Polygon',
            coordinates
          },
          properties: {
            name: region.attributes.name,
            type: region.attributes.type,
            ...region.attributes
          }
        });
      }
    }

    const geojson = {
      type: 'FeatureCollection',
      features
    };

    await fs.writeFile(
      path.join(outputDir, 'map.geojson'),
      JSON.stringify(geojson, null, 2)
    );
  }

  /**
   * Generate README
   */
  async _generateReadme(project, outputDir) {
    const summary = project.getSummary();

    const readme = `# ${project.name}

${project.description}

## Project Information

- **Project ID**: ${project.id}
- **Created**: ${project.metadata.created}
- **Last Updated**: ${project.metadata.updated}
- **Status**: ${project.metadata.status}
${project.metadata.author ? `- **Author**: ${project.metadata.author}` : ''}

## Contents

- **Entities**: ${summary.counts.entities}
  - Regions: ${summary.counts.regions}
  - Papers: ${summary.counts.papers}
  - Datasets: ${summary.counts.datasets}
  - Models: ${summary.counts.models}
  - Workflows: ${summary.counts.workflows}
- **Evidence Chains**: ${summary.counts.evidenceChains}

## Files

- \`teruvion.project.json\` - Project metadata
- \`entities.json\` - All entities in this project
- \`triples.json\` - All relationships between entities
- \`events.jsonl\` - Event log (OCPM)
- \`evidence/\` - Evidence chains for claims
- \`map.geojson\` - Geographic data (regions)
- \`README.md\` - This file

## Usage

This is a Teruvion project export (v0.1.0). It can be:

1. **Imported** back into Teruvion
2. **Visualized** using Teruvion Web Viewer
3. **Version controlled** with Git
4. **Shared** with collaborators
5. **Inspected** manually (all files are human-readable JSON)

## Teruvion

Learn more: https://github.com/Grups666/teruvion

Generated by Teruvion Core Engine v0.1.0
`;

    await fs.writeFile(path.join(outputDir, 'README.md'), readme);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = Exporter;
