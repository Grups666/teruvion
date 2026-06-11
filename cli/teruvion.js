#!/usr/bin/env node

/**
 * Teruvion CLI
 * Command-line interface for research decomposition engine
 */

const { Command } = require('commander');
const { TripleStore, VERIFICATION_STATES } = require('../core/registry/TripleStore');
const EventLog = require('../core/events/EventLog');
const EvidenceChain = require('../core/evidence/Chain');
const { SourceAdmission } = require('../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../core/understanding/DigitalEarthDecomposer');
const { Project, ProjectRegistry } = require('../core/project/Project');
const Exporter = require('../core/project/Exporter');
const llm = require('../core/utils/llm');
const ConnectorRegistry = require('../core/connectors/ConnectorRegistry');

const program = new Command();

// Shared store, event log, and project registry
let store = null;
let eventLog = null;
let projectRegistry = null;

async function initializeStore() {
  if (!store) {
    store = new TripleStore();
    eventLog = new EventLog();
    projectRegistry = new ProjectRegistry();

    await store.load().catch(() => {});
    await eventLog.load().catch(() => {});
    await projectRegistry.load().catch(() => {});
  }
  return { store, eventLog, projectRegistry };
}

// ============================================================================
// MAIN PROGRAM
// ============================================================================

program
  .name('teruvion')
  .description('Research Decomposition & Recomposition Engine')
  .version('0.1.0');

// ============================================================================
// INGEST COMMAND
// ============================================================================

program
  .command('ingest <input>')
  .description('Import a source through the Digital Earth pipeline')
  .action(async (input) => {
    try {
      const { store, eventLog, projectRegistry } = await initializeStore();

      console.log('Starting Digital Earth import...\n');

      // Step 1: Fetch content
      console.log('Fetching content...');
      const config = {
        githubToken: llm.getGitHubToken(),
        openAlexKey: llm.getOpenAlexKey()
      };
      const connectorRegistry = new ConnectorRegistry(config);
      const content = await connectorRegistry.fetch(input);

      // Step 2: Source Admission
      console.log('Evaluating source admission...');
      const admission = new SourceAdmission(llm);
      const admissionResult = await admission.evaluate(input, content, {});

      if (!admissionResult.admitted) {
        console.log(`\n✗ Source rejected: ${admissionResult.reasoning}`);
        process.exit(1);
      }

      console.log(`  Depth: ${admissionResult.depth}`);
      console.log(`  Primary role: ${admissionResult.primaryRole}`);

      // Step 3: Decomposition
      console.log('Decomposing source...');
      const decomposer = new DigitalEarthDecomposer(llm);
      const decomposition = await decomposer.decompose(input, content, admissionResult);

      console.log(`  Capabilities: ${decomposition.capabilityObjects?.length || 0}`);
      console.log(`  World objects: ${decomposition.worldObjects?.length || 0}`);
      console.log(`  Evidence: ${decomposition.evidenceObjects?.length || 0}`);
      console.log(`  Bridge relations: ${decomposition.bridgeRelations?.length || 0}`);

      // Step 4: Store entities
      console.log('Storing entities...');
      const entityCount = store.entities.size;

      // Store source object
      if (decomposition.sourceObject) {
        const { Entity } = require('../core/registry/TripleStore');
        const sourceEntity = new Entity(
          decomposition.sourceObject.type,
          decomposition.sourceObject,
          { source: input, extractedBy: 'DigitalEarthDecomposer' }
        );
        store.addEntity(sourceEntity);
      }

      // Store capability objects
      for (const cap of (decomposition.capabilityObjects || [])) {
        const { Entity } = require('../core/registry/TripleStore');
        const entity = new Entity(
          cap.type,
          cap,
          { source: input, extractedBy: 'DigitalEarthDecomposer', confidence: cap.confidence }
        );
        store.addEntity(entity);
      }

      // Store world objects
      for (const world of (decomposition.worldObjects || [])) {
        const { Entity } = require('../core/registry/TripleStore');
        const entity = new Entity(
          world.type,
          world,
          { source: input, extractedBy: 'DigitalEarthDecomposer', confidence: world.confidence }
        );
        store.addEntity(entity);
      }

      const newEntityCount = store.entities.size - entityCount;

      await store.save();
      console.log('\n✓ Import complete:');
      console.log(`  New entities: ${newEntityCount}`);
      console.log(`  Total entities in store: ${store.entities.size}`);
      console.log(`  Processing time: ${decomposition.processingTime}ms`);

    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// LIST COMMAND
// ============================================================================

program
  .command('list')
  .description('List all entities')
  .option('-t, --type <type>', 'Filter by entity type')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const { store } = await initializeStore();

      let entities;
      if (options.type) {
        entities = store.getEntitiesByType(options.type);
      } else {
        entities = Array.from(store.entities.values());
      }

      const limit = parseInt(options.limit);
      const displayed = entities.slice(0, limit);

      console.log(`Found ${entities.length} entities${options.type ? ` of type ${options.type}` : ''}:\n`);

      displayed.forEach(entity => {
        console.log(`[${entity.type}] ${entity.getDisplayName()}`);
        console.log(`  ID: ${entity.id}`);
        console.log(`  Created: ${entity.createdAt}`);

        if (entity.attributes.doi) {
          console.log(`  DOI: ${entity.attributes.doi}`);
        }
        if (entity.attributes.repo) {
          console.log(`  Repo: ${entity.attributes.repo}`);
        }

        console.log();
      });

      if (entities.length > limit) {
        console.log(`... and ${entities.length - limit} more (use --limit to show more)`);
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// SHOW COMMAND
// ============================================================================

program
  .command('show <id>')
  .description('Show entity details and relationships')
  .action(async (id) => {
    try {
      const { store } = await initializeStore();

      const entity = store.getEntity(id);
      if (!entity) {
        console.log('Entity not found');
        return;
      }

      console.log('='.repeat(60));
      console.log(`${entity.type}: ${entity.getDisplayName()}`);
      console.log('='.repeat(60));
      console.log();

      console.log('Attributes:');
      console.log(JSON.stringify(entity.attributes, null, 2));
      console.log();

      console.log('Metadata:');
      console.log(`  Source: ${entity.metadata.source || 'Unknown'}`);
      console.log(`  Confidence: ${entity.metadata.confidence}`);
      console.log(`  Extracted by: ${entity.metadata.extractedBy || 'Unknown'}`);
      console.log(`  Created: ${entity.createdAt}`);
      console.log();

      const relations = store.getRelations(id);

      if (relations.outgoing.length > 0) {
        console.log('Outgoing relations:');
        relations.outgoing.forEach(rel => {
          const target = store.getEntity(rel.object);
          console.log(`  ${rel.predicate} → [${target?.type}] ${target?.getDisplayName() || rel.object}`);
        });
        console.log();
      }

      if (relations.incoming.length > 0) {
        console.log('Incoming relations:');
        relations.incoming.forEach(rel => {
          const source = store.getEntity(rel.subject);
          console.log(`  [${source?.type}] ${source?.getDisplayName() || rel.subject} → ${rel.predicate}`);
        });
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// STATS COMMAND
// ============================================================================

program
  .command('stats')
  .description('Show registry statistics')
  .action(async () => {
    try {
      const { store } = await initializeStore();

      const stats = store.stats();

      console.log('Registry Statistics:');
      console.log('='.repeat(60));
      console.log(`Total entities: ${stats.totalEntities}`);
      console.log(`Total triples: ${stats.totalTriples}`);
      console.log();

      console.log('Entities by type:');
      Object.entries(stats.entitiesByType)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
      console.log();

      console.log('Relations by type:');
      Object.entries(stats.triplesByRelation)
        .sort((a, b) => b[1] - a[1])
        .forEach(([rel, count]) => {
          console.log(`  ${rel}: ${count}`);
        });
      console.log();

      console.log('Verification states:');
      console.log('  Entities:');
      Object.entries(stats.verificationStates.entities)
        .forEach(([state, count]) => {
          console.log(`    ${state}: ${count}`);
        });
      console.log('  Triples:');
      Object.entries(stats.verificationStates.triples)
        .forEach(([state, count]) => {
          console.log(`    ${state}: ${count}`);
        });
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// QUERY COMMAND
// ============================================================================

program
  .command('query <subject> <predicate>')
  .description('Query: find objects for subject-predicate pair')
  .action(async (subject, predicate) => {
    try {
      const { store } = await initializeStore();

      const objects = store.query(subject, predicate);

      console.log(`Query: ${subject} -${predicate}-> ?`);
      console.log(`Found ${objects.length} results:\n`);

      objects.forEach(objId => {
        const obj = store.getEntity(objId);
        if (obj) {
          console.log(`  [${obj.type}] ${obj.getDisplayName()} (${objId})`);
        } else {
          console.log(`  ${objId} (literal value)`);
        }
      });
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// EVENTS COMMAND
// ============================================================================

program
  .command('events')
  .description('Show event log (OCPM)')
  .option('-o, --object <id>', 'Filter by object ID')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const { eventLog } = await initializeStore();

      let events;
      if (options.object) {
        events = eventLog.getEventsForObject(options.object);
        console.log(`Events for object ${options.object}:\n`);
      } else {
        events = eventLog.events;
        console.log('All events:\n');
      }

      const limit = parseInt(options.limit);
      const displayed = events.slice(-limit); // Show most recent

      displayed.forEach(e => {
        console.log(`[${e.timestamp}] ${e.type}`);
        console.log(`  Objects: ${e.objects.join(', ')}`);
        if (Object.keys(e.details).length > 0) {
          console.log(`  Details: ${JSON.stringify(e.details)}`);
        }
        console.log();
      });

      if (events.length > limit) {
        console.log(`... and ${events.length - limit} more events (use --limit to show more)`);
      }

      // Show stats
      const stats = eventLog.getStats();
      console.log('\nEvent Log Statistics:');
      console.log(`  Total events: ${stats.totalEvents}`);
      console.log(`  Unique objects: ${stats.uniqueObjects}`);
      console.log('  Events by type:');
      Object.entries(stats.eventsByType).forEach(([type, count]) => {
        console.log(`    ${type}: ${count}`);
      });
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// EVIDENCE COMMAND
// ============================================================================

program
  .command('evidence <id>')
  .description('Build and visualize evidence chain for a claim/conclusion')
  .action(async (id) => {
    try {
      const { store } = await initializeStore();

      const evidenceChain = new EvidenceChain(store);
      const chainData = await evidenceChain.build(id);

      console.log(evidenceChain.visualize(chainData));
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// TYPES COMMAND
// ============================================================================

program
  .command('types')
  .description('Show all available entity types')
  .action(() => {
    console.log('Available Entity Types:\n');

    const categories = {
      'Knowledge Layer': ['ResearchQuestion', 'Hypothesis', 'Claim', 'Theory'],
      'Resource Layer': ['Paper', 'Dataset', 'Model', 'Code', 'Figure'],
      'Method Layer': ['Method', 'Experiment', 'Metric'],
      'Spatiotemporal Layer': ['Region', 'TimeRange'],
      'Process Layer': ['Workflow']
    };

    Object.entries(categories).forEach(([category, types]) => {
      console.log(`${category}:`);
      types.forEach(type => {
        console.log(`  - ${type}`);
      });
      console.log();
    });
  });

// ============================================================================
// EXPORT COMMAND
// ============================================================================

program
  .command('export')
  .description('Export knowledge graph as DOT (Graphviz)')
  .option('-o, --output <file>', 'Output file', 'graph.dot')
  .action(async (options) => {
    try {
      const { store } = await initializeStore();

      const dot = store.toDot();
      const fs = require('fs').promises;
      await fs.writeFile(options.output, dot);

      console.log(`✓ Graph exported to ${options.output}`);
      console.log('  To visualize: dot -Tpng graph.dot -o graph.png');
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// VERIFY COMMAND
// ============================================================================

program
  .command('verify <id>')
  .description('Verify an entity or triple')
  .option('-s, --state <state>', 'Verification state (extracted/reviewed/verified/uncertain/rejected)', 'verified')
  .option('-n, --note <note>', 'Add a note')
  .option('-r, --reviewer <name>', 'Reviewer name', 'user')
  .action(async (id, options) => {
    try {
      const { store } = await initializeStore();

      // Check if it's an entity or triple
      const entity = store.getEntity(id);

      if (!entity) {
        console.log('Entity not found');
        return;
      }

      // Verify state is valid
      const validStates = Object.values(VERIFICATION_STATES);
      if (!validStates.includes(options.state)) {
        console.log(`Invalid state. Valid states: ${validStates.join(', ')}`);
        return;
      }

      // Verify the entity
      entity.verify(options.state, options.reviewer, options.note);

      await store.save();

      console.log(`✓ Entity ${id} marked as ${options.state}`);
      if (options.note) {
        console.log(`  Note: ${options.note}`);
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// UNVERIFIED COMMAND
// ============================================================================

program
  .command('unverified')
  .description('List unverified entities')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const { store } = await initializeStore();

      const unverified = store.getUnverifiedEntities();
      const limit = parseInt(options.limit);
      const displayed = unverified.slice(0, limit);

      console.log(`Found ${unverified.length} unverified entities:\n`);

      displayed.forEach(entity => {
        console.log(`[${entity.type}] ${entity.getDisplayName()}`);
        console.log(`  ID: ${entity.id}`);
        console.log(`  Source: ${entity.metadata.source || 'Unknown'}`);
        console.log(`  Extracted by: ${entity.metadata.extractedBy || 'Unknown'}`);
        console.log();
      });

      if (unverified.length > limit) {
        console.log(`... and ${unverified.length - limit} more (use --limit to show more)`);
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// PROJECT COMMANDS
// ============================================================================

program
  .command('project')
  .description('Project management commands')
  .action(() => {
    console.log('Use "teruvion project <command>" to manage projects');
    console.log('Available commands: create, list, show, add, export');
  });

program
  .command('project:create <name>')
  .description('Create a new project')
  .option('-d, --description <text>', 'Project description', '')
  .option('-a, --author <name>', 'Author name')
  .action(async (name, options) => {
    try {
      const { projectRegistry } = await initializeStore();

      const project = new Project(name, options.description, {
        author: options.author
      });

      projectRegistry.addProject(project);
      await projectRegistry.save();

      console.log(`✓ Project created: ${project.id}`);
      console.log(`  Name: ${project.name}`);
      console.log(`  Description: ${project.description || '(none)'}`);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('project:list')
  .description('List all projects')
  .action(async () => {
    try {
      const { projectRegistry } = await initializeStore();

      const projects = projectRegistry.getAllProjects();

      if (projects.length === 0) {
        console.log('No projects found. Create one with: teruvion project:create <name>');
        return;
      }

      console.log(`Found ${projects.length} projects:\n`);

      projects.forEach(project => {
        const summary = project.getSummary();
        console.log(`[${project.id}] ${project.name}`);
        console.log(`  Description: ${project.description || '(none)'}`);
        console.log(`  Entities: ${summary.counts.entities}, Papers: ${summary.counts.papers}, Datasets: ${summary.counts.datasets}`);
        console.log(`  Status: ${project.metadata.status}`);
        console.log();
      });
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('project:show <id>')
  .description('Show project details')
  .action(async (id) => {
    try {
      const { projectRegistry } = await initializeStore();

      const project = projectRegistry.getProject(id);
      if (!project) {
        console.log('Project not found');
        return;
      }

      const summary = project.getSummary();

      console.log('='.repeat(60));
      console.log(`Project: ${project.name}`);
      console.log('='.repeat(60));
      console.log();

      console.log('Description:');
      console.log(`  ${project.description || '(none)'}`);
      console.log();

      console.log('Metadata:');
      console.log(`  ID: ${project.id}`);
      console.log(`  Created: ${project.metadata.created}`);
      console.log(`  Updated: ${project.metadata.updated}`);
      console.log(`  Status: ${project.metadata.status}`);
      if (project.metadata.author) {
        console.log(`  Author: ${project.metadata.author}`);
      }
      console.log();

      console.log('Contents:');
      console.log(`  Total entities: ${summary.counts.entities}`);
      console.log(`  Regions: ${summary.counts.regions}`);
      console.log(`  Papers: ${summary.counts.papers}`);
      console.log(`  Datasets: ${summary.counts.datasets}`);
      console.log(`  Models: ${summary.counts.models}`);
      console.log(`  Workflows: ${summary.counts.workflows}`);
      console.log(`  Evidence chains: ${summary.counts.evidenceChains}`);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('project:add <projectId> <entityId>')
  .description('Add an entity to a project')
  .action(async (projectId, entityId) => {
    try {
      const { store, projectRegistry } = await initializeStore();

      const project = projectRegistry.getProject(projectId);
      if (!project) {
        console.log('Project not found');
        return;
      }

      const entity = store.getEntity(entityId);
      if (!entity) {
        console.log('Entity not found');
        return;
      }

      project.addEntity(entityId, entity.type);
      await projectRegistry.save();

      console.log(`✓ Added ${entity.type} "${entity.getDisplayName()}" to project "${project.name}"`);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('project:export <projectId>')
  .description('Export a project to a directory')
  .option('-o, --output <dir>', 'Output directory', './export')
  .action(async (projectId, options) => {
    try {
      const { store, eventLog, projectRegistry } = await initializeStore();

      const project = projectRegistry.getProject(projectId);
      if (!project) {
        console.log('Project not found');
        return;
      }

      const exporter = new Exporter(store, eventLog, projectRegistry);
      const result = await exporter.exportProject(projectId, options.output);

      console.log(`✓ Project exported to ${result.outputDir}`);
      console.log('\nExported files:');
      result.files.forEach(f => console.log(`  - ${f}`));
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

// ============================================================================
// PARSE AND EXECUTE
// ============================================================================

program.parse();
