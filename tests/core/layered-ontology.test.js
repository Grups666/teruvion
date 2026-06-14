/**
 * Five-Layer Ontology Tests
 * Tests for the five-layer ontology system:
 * Layer 0: Foundation, Layer 1: Source, Layer 2: Capability, Layer 3: World, Layer 4: Domain
 */

const { assert, describe, it } = require('../setup');

describe('Foundation Ontology Layer (Layer 0)', () => {
  it('should have all foundation entity types', () => {
    const foundation = require('../../core/registry/ontology/foundation');

    const expectedTypes = ['Entity', 'Object', 'System', 'State', 'Process', 'Event',
      'Action', 'Intervention', 'Agent', 'Resource', 'Data', 'Claim', 'Evidence',
      'Observation', 'Measurement', 'Method', 'Model', 'Metric', 'Uncertainty',
      'Scenario', 'Risk', 'Location', 'Time', 'Relation'];

    for (const typeName of expectedTypes) {
      assert.ok(foundation.FOUNDATION_ENTITIES[typeName], `Should have foundation entity: ${typeName}`);
    }
  });

  it('should have all foundation relation types', () => {
    const foundation = require('../../core/registry/ontology/foundation');

    const expectedRelations = ['is_a', 'has_part', 'part_of', 'connected_to', 'causes',
      'caused_by', 'triggers', 'precedes', 'follows', 'performs', 'performed_by',
      'targets', 'uses', 'produces', 'consumes', 'claims', 'supports', 'contradicts',
      'derives_from', 'applies', 'implements', 'evaluates', 'evaluated_by', 'measures',
      'measured_by', 'located_at', 'occurs_at', 'during', 'relates_to'];

    for (const relName of expectedRelations) {
      assert.ok(foundation.FOUNDATION_RELATIONS[relName], `Should have foundation relation: ${relName}`);
    }
  });

  it('should validate foundation entity types', () => {
    const foundation = require('../../core/registry/ontology/foundation');

    for (const typeName of Object.keys(foundation.FOUNDATION_ENTITIES)) {
      assert.ok(foundation.validateEntityType(typeName), `${typeName} should be valid`);
    }
  });

  it('should categorize entities by category', () => {
    const foundation = require('../../core/registry/ontology/foundation');

    const categories = foundation.getEntitiesByCategory();
    assert.ok(categories.existence, 'Should have existence category');
    assert.ok(categories.process, 'Should have process category');
    assert.ok(categories.knowledge, 'Should have knowledge category');
    assert.ok(categories.context, 'Should have context category');
  });
});

describe('Source Ontology Layer (Layer 1)', () => {
  it('should have paper source types', () => {
    const source = require('../../core/registry/ontology/source');

    assert.ok(source.SOURCE_ENTITIES.Paper, 'Should have Paper');
    assert.ok(source.SOURCE_ENTITIES.Preprint, 'Should have Preprint');
    assert.ok(source.SOURCE_ENTITIES.Thesis, 'Should have Thesis');
  });

  it('should have code source types', () => {
    const source = require('../../core/registry/ontology/source');

    assert.ok(source.SOURCE_ENTITIES.Repository, 'Should have Repository');
    assert.ok(source.SOURCE_ENTITIES.Package, 'Should have Package');
    assert.ok(source.SOURCE_ENTITIES.APIPage, 'Should have APIPage');
  });

  it('should have data source types', () => {
    const source = require('../../core/registry/ontology/source');

    assert.ok(source.SOURCE_ENTITIES.DatasetPage, 'Should have DatasetPage');
    assert.ok(source.SOURCE_ENTITIES.DataCatalog, 'Should have DataCatalog');
  });

  it('should have report and news source types', () => {
    const source = require('../../core/registry/ontology/source');

    assert.ok(source.SOURCE_ENTITIES.Report, 'Should have Report');
    assert.ok(source.SOURCE_ENTITIES.AssessmentReport, 'Should have AssessmentReport');
    assert.ok(source.SOURCE_ENTITIES.News, 'Should have News');
    assert.ok(source.SOURCE_ENTITIES.PolicyDocument, 'Should have PolicyDocument');
  });

  it('should specify parent types via extends', () => {
    const source = require('../../core/registry/ontology/source');

    for (const [name, def] of Object.entries(source.SOURCE_ENTITIES)) {
      assert.ok(def.extends, `${name} should specify extends`);
      assert.strictEqual(def.layer, 'source', `${name} should be in source layer`);
    }
  });

  it('should provide merged schemas', () => {
    const source = require('../../core/registry/ontology/source');

    const paperSchema = source.getMergedSchema('Paper');
    assert.ok(paperSchema, 'Should have merged schema for Paper');
    assert.strictEqual(paperSchema.extends, 'Source', 'Paper should extend Source');
  });

  it('should identify source types correctly', () => {
    const source = require('../../core/registry/ontology/source');

    assert.strictEqual(source.isSourceType('Paper'), true, 'Paper is a source type');
    assert.strictEqual(source.isSourceType('Repository'), true, 'Repository is a source type');
  });
});

describe('Capability Ontology Layer (Layer 2)', () => {
  it('should have data capability types', () => {
    const capability = require('../../core/registry/ontology/capability');

    assert.ok(capability.CAPABILITY_ENTITIES.Dataset, 'Should have Dataset');
    assert.ok(capability.CAPABILITY_ENTITIES.Variable, 'Should have Variable');
    assert.ok(capability.CAPABILITY_ENTITIES.Coverage, 'Should have Coverage');
  });

  it('should have observation capability types', () => {
    const capability = require('../../core/registry/ontology/capability');

    assert.ok(capability.CAPABILITY_ENTITIES.Sensor, 'Should have Sensor');
    assert.ok(capability.CAPABILITY_ENTITIES.Satellite, 'Should have Satellite');
    assert.ok(capability.CAPABILITY_ENTITIES.Gauge, 'Should have Gauge');
    assert.ok(capability.CAPABILITY_ENTITIES.Station, 'Should have Station');
  });

  it('should have modeling capability types', () => {
    const capability = require('../../core/registry/ontology/capability');

    assert.ok(capability.CAPABILITY_ENTITIES.Model, 'Should have Model');
    assert.ok(capability.CAPABILITY_ENTITIES.Algorithm, 'Should have Algorithm');
    assert.ok(capability.CAPABILITY_ENTITIES.Simulation, 'Should have Simulation');
    assert.ok(capability.CAPABILITY_ENTITIES.Forecasting, 'Should have Forecasting');
  });

  it('should have computing capability types', () => {
    const capability = require('../../core/registry/ontology/capability');

    assert.ok(capability.CAPABILITY_ENTITIES.Software, 'Should have Software');
    assert.ok(capability.CAPABILITY_ENTITIES.Workflow, 'Should have Workflow');
    assert.ok(capability.CAPABILITY_ENTITIES.API, 'Should have API');
  });

  it('should have governance capability types', () => {
    const capability = require('../../core/registry/ontology/capability');

    assert.ok(capability.CAPABILITY_ENTITIES.Policy, 'Should have Policy');
    assert.ok(capability.CAPABILITY_ENTITIES.Regulation, 'Should have Regulation');
    assert.ok(capability.CAPABILITY_ENTITIES.Institution, 'Should have Institution');
  });

  it('should have action/intervention capability types', () => {
    const capability = require('../../core/registry/ontology/capability');

    assert.ok(capability.CAPABILITY_ENTITIES.Intervention, 'Should have Intervention');
    assert.ok(capability.CAPABILITY_ENTITIES.AdaptationMeasure, 'Should have AdaptationMeasure');
    assert.ok(capability.CAPABILITY_ENTITIES.EmergencyResponse, 'Should have EmergencyResponse');
  });
});

describe('Digital Earth World Ontology Layer (Layer 3)', () => {
  it('should have earth system types', () => {
    const world = require('../../core/registry/ontology/world');

    assert.ok(world.WORLD_ENTITIES.EarthSystem, 'Should have EarthSystem');
    assert.ok(world.WORLD_ENTITIES.Hydrosphere, 'Should have Hydrosphere');
    assert.ok(world.WORLD_ENTITIES.Atmosphere, 'Should have Atmosphere');
    assert.ok(world.WORLD_ENTITIES.Biosphere, 'Should have Biosphere');
  });

  it('should have earth object types', () => {
    const world = require('../../core/registry/ontology/world');

    assert.ok(world.WORLD_ENTITIES.Region, 'Should have Region');
    assert.ok(world.WORLD_ENTITIES.Basin, 'Should have Basin');
    assert.ok(world.WORLD_ENTITIES.Glacier, 'Should have Glacier');
    assert.ok(world.WORLD_ENTITIES.Lake, 'Should have Lake');
    assert.ok(world.WORLD_ENTITIES.Aquifer, 'Should have Aquifer');
  });

  it('should have earth variable types', () => {
    const world = require('../../core/registry/ontology/world');

    assert.ok(world.WORLD_ENTITIES.Streamflow, 'Should have Streamflow');
    assert.ok(world.WORLD_ENTITIES.Precipitation, 'Should have Precipitation');
    assert.ok(world.WORLD_ENTITIES.Temperature, 'Should have Temperature');
    assert.ok(world.WORLD_ENTITIES.SoilMoisture, 'Should have SoilMoisture');
  });

  it('should have hazard types', () => {
    const world = require('../../core/registry/ontology/world');

    assert.ok(world.WORLD_ENTITIES.Hazard, 'Should have Hazard');
    assert.ok(world.WORLD_ENTITIES.FloodEvent, 'Should have FloodEvent');
    assert.ok(world.WORLD_ENTITIES.DroughtEvent, 'Should have DroughtEvent');
    assert.ok(world.WORLD_ENTITIES.Heatwave, 'Should have Heatwave');
  });

  it('should have risk types', () => {
    const world = require('../../core/registry/ontology/world');

    assert.ok(world.WORLD_ENTITIES.EarthRisk, 'Should have EarthRisk');
    assert.ok(world.WORLD_ENTITIES.FloodRisk, 'Should have FloodRisk');
    assert.ok(world.WORLD_ENTITIES.Exposure, 'Should have Exposure');
    assert.ok(world.WORLD_ENTITIES.Vulnerability, 'Should have Vulnerability');
  });

  it('should have infrastructure types', () => {
    const world = require('../../core/registry/ontology/world');

    assert.ok(world.WORLD_ENTITIES.Infrastructure, 'Should have Infrastructure');
    assert.ok(world.WORLD_ENTITIES.Dam, 'Should have Dam');
    assert.ok(world.WORLD_ENTITIES.Reservoir, 'Should have Reservoir');
    assert.ok(world.WORLD_ENTITIES.PowerGrid, 'Should have PowerGrid');
  });

  it('should have scenario types', () => {
    const world = require('../../core/registry/ontology/world');

    assert.ok(world.WORLD_ENTITIES.EarthScenario, 'Should have EarthScenario');
    assert.ok(world.WORLD_ENTITIES.ClimateScenario, 'Should have ClimateScenario');
    assert.ok(world.WORLD_ENTITIES.ModelOutput, 'Should have ModelOutput');
    assert.ok(world.WORLD_ENTITIES.Forecast, 'Should have Forecast');
  });
});

describe('Domain Extensions (Layer 4)', () => {
  it('should have hydrology domain', () => {
    const domain = require('../../core/registry/ontology/domain');

    const hydro = domain.getDomain('hydrology');
    assert.ok(hydro, 'Should have hydrology domain');
    assert.ok(hydro.entities.River, 'Should have River');
    assert.ok(hydro.entities.GaugeStation, 'Should have GaugeStation');
    assert.ok(hydro.entities.HydrologicalModel, 'Should have HydrologicalModel');
  });

  it('should have climate domain', () => {
    const domain = require('../../core/registry/ontology/domain');

    const climate = domain.getDomain('climate');
    assert.ok(climate, 'Should have climate domain');
    assert.ok(climate.entities.ClimateZone, 'Should have ClimateZone');
    assert.ok(climate.entities.ClimateModel, 'Should have ClimateModel');
    assert.ok(climate.entities.GCM, 'Should have GCM');
  });

  it('should have urban domain', () => {
    const domain = require('../../core/registry/ontology/domain');

    const urban = domain.getDomain('urban');
    assert.ok(urban, 'Should have urban domain');
    assert.ok(urban.entities.City, 'Should have City');
    assert.ok(urban.entities.Building, 'Should have Building');
    assert.ok(urban.entities.UrbanFlood, 'Should have UrbanFlood');
  });

  it('should have energy domain', () => {
    const domain = require('../../core/registry/ontology/domain');

    const energy = domain.getDomain('energy');
    assert.ok(energy, 'Should have energy domain');
    assert.ok(energy.entities.Substation, 'Should have Substation');
    assert.ok(energy.entities.HydropowerPlant, 'Should have HydropowerPlant');
  });

  it('should have ecology domain', () => {
    const domain = require('../../core/registry/ontology/domain');

    const ecology = domain.getDomain('ecology');
    assert.ok(ecology, 'Should have ecology domain');
    assert.ok(ecology.entities.Ecosystem, 'Should have Ecosystem');
    assert.ok(ecology.entities.Species, 'Should have Species');
    assert.ok(ecology.entities.CarbonSink, 'Should have CarbonSink');
  });

  it('should have agriculture domain', () => {
    const domain = require('../../core/registry/ontology/domain');

    const agriculture = domain.getDomain('agriculture');
    assert.ok(agriculture, 'Should have agriculture domain');
    assert.ok(agriculture.entities.Crop, 'Should have Crop');
    assert.ok(agriculture.entities.IrrigationDemand, 'Should have IrrigationDemand');
  });

  it('should identify domain entities', () => {
    const domain = require('../../core/registry/ontology/domain');

    assert.strictEqual(domain.isDomainEntity('River'), true, 'River is domain entity');
    assert.strictEqual(domain.isDomainEntity('City'), true, 'City is domain entity');
    assert.strictEqual(domain.isDomainEntity('Paper'), false, 'Paper is not domain entity');
  });

  it('should register new domains', () => {
    const domain = require('../../core/registry/ontology/domain');

    const testDomain = {
      name: 'test-domain',
      description: 'Test domain',
      entities: {
        TestEntity: {
          name: 'TestEntity',
          extends: 'Entity',
          layer: 'domain',
          domain: 'test-domain',
          description: 'A test entity',
          additionalRequired: [],
          additionalOptional: ['testField'],
          additionalDefaults: {}
        }
      },
      relations: {}
    };

    domain.registerDomain('test-domain', testDomain);
    assert.ok(domain.getDomain('test-domain'), 'Should have test domain');
    assert.strictEqual(domain.isDomainEntity('TestEntity'), true, 'TestEntity should be domain entity');
  });
});

describe('Unified Ontology Index (All 5 Layers)', () => {
  it('should merge all entity types across layers', () => {
    const ontology = require('../../core/registry/ontology/index');

    const types = ontology.getAllEntityTypes();
    // Foundation
    assert.ok(types.Entity, 'Should have foundation Entity');
    assert.ok(types.Process, 'Should have foundation Process');
    // Source
    assert.ok(types.Paper, 'Should have source Paper');
    assert.ok(types.Repository, 'Should have source Repository');
    // Capability
    assert.ok(types.Dataset, 'Should have capability Dataset');
    assert.ok(types.Model, 'Should have capability Model');
    assert.ok(types.Sensor, 'Should have capability Sensor');
    // World
    assert.ok(types.Basin, 'Should have world Basin');
    assert.ok(types.FloodEvent, 'Should have world FloodEvent');
    // Domain
    assert.ok(types.River, 'Should have domain River');
    assert.ok(types.City, 'Should have domain City');
  });

  it('should merge all relation types across layers', () => {
    const ontology = require('../../core/registry/ontology/index');

    const relations = ontology.getAllRelationTypes();
    // Foundation
    assert.ok(relations.causes, 'Should have foundation causes');
    assert.ok(relations.uses, 'Should have foundation uses');
    // Source
    assert.ok(relations.cited_by, 'Should have source cited_by');
    // Capability
    assert.ok(relations.observes, 'Should have capability observes');
    assert.ok(relations.simulates, 'Should have capability simulates');
    // World
    assert.ok(relations.drains_to, 'Should have world drains_to');
    assert.ok(relations.flows_through, 'Should have world flows_through');
  });

  it('should validate types across all layers', () => {
    const ontology = require('../../core/registry/ontology/index');

    // Foundation types
    ontology.validateEntityType('Entity');
    ontology.validateEntityType('Process');

    // Source types
    ontology.validateEntityType('Paper');
    ontology.validateEntityType('Repository');

    // Capability types
    ontology.validateEntityType('Dataset');
    ontology.validateEntityType('Model');

    // World types
    ontology.validateEntityType('Basin');
    ontology.validateEntityType('FloodEvent');

    // Domain types
    ontology.validateEntityType('River');
    ontology.validateEntityType('City');
  });

  it('should determine entity layers', () => {
    const ontology = require('../../core/registry/ontology/index');

    assert.strictEqual(ontology.getEntityLayer('Entity'), 'foundation');
    assert.strictEqual(ontology.getEntityLayer('Paper'), 'source');
    assert.strictEqual(ontology.getEntityLayer('Dataset'), 'capability');
    assert.strictEqual(ontology.getEntityLayer('Basin'), 'world');
    assert.strictEqual(ontology.getEntityLayer('River'), 'domain');
  });

  it('should get entities by layer', () => {
    const ontology = require('../../core/registry/ontology/index');

    const layers = ontology.getEntitiesByLayer();
    assert.ok(layers.foundation.length > 0, 'Foundation layer should have entities');
    assert.ok(layers.source.length > 0, 'Source layer should have entities');
    assert.ok(layers.capability.length > 0, 'Capability layer should have entities');
    assert.ok(layers.world.length > 0, 'World layer should have entities');
    assert.ok(layers.domain.length > 0, 'Domain layer should have entities');
  });

  it('should get schemas for any type across layers', () => {
    const ontology = require('../../core/registry/ontology/index');

    const entitySchema = ontology.getEntitySchema('Entity');
    assert.ok(entitySchema, 'Should have schema for Entity');
    assert.strictEqual(entitySchema.layer, 'foundation');

    const paperSchema = ontology.getEntitySchema('Paper');
    assert.ok(paperSchema, 'Should have schema for Paper');
    assert.strictEqual(paperSchema.extends, 'Source', 'Paper extends Source');

    const basinSchema = ontology.getEntitySchema('Basin');
    assert.ok(basinSchema, 'Should have schema for Basin');
    assert.strictEqual(basinSchema.layer, 'world');
  });

  it('should provide ontology statistics', () => {
    const ontology = require('../../core/registry/ontology/index');

    const stats = ontology.getOntologyStats();
    assert.ok(stats.totalEntities > 200, 'Should have 200+ entity types');
    assert.ok(stats.totalRelations > 50, 'Should have 50+ relation types');
    assert.ok(stats.byLayer.foundation > 0, 'Should have foundation entities');
    assert.ok(stats.byLayer.source > 0, 'Should have source entities');
    assert.ok(stats.byLayer.capability > 0, 'Should have capability entities');
    assert.ok(stats.byLayer.world > 0, 'Should have world entities');
    assert.ok(stats.byLayer.domain > 0, 'Should have domain entities');
  });
});

describe('Backward Compatibility', () => {
  it('should export legacy ENTITY_TYPES format', () => {
    const ontology = require('../../core/registry/ontology');

    // Old constant format should still work
    assert.strictEqual(ontology.ENTITY_TYPES.PAPER, 'Paper');
    assert.strictEqual(ontology.ENTITY_TYPES.DATASET, 'Dataset');
    assert.strictEqual(ontology.ENTITY_TYPES.CLAIM, 'Claim');
    assert.strictEqual(ontology.ENTITY_TYPES.REGION, 'Region');
    assert.strictEqual(ontology.ENTITY_TYPES.BASIN, 'Basin');
  });

  it('should export legacy RELATION_TYPES format', () => {
    const ontology = require('../../core/registry/ontology');

    // Old constant format should still work
    assert.strictEqual(ontology.RELATION_TYPES.USES, 'uses');
    assert.strictEqual(ontology.RELATION_TYPES.SUPPORTS, 'supports');
    assert.strictEqual(ontology.RELATION_TYPES.DRAINS_TO, 'drains_to');
  });

  it('should export new entity constants', () => {
    const ontology = require('../../core/registry/ontology');

    // New entity types should be accessible
    assert.strictEqual(ontology.ENTITY_TYPES.RIVER, 'River');
    assert.strictEqual(ontology.ENTITY_TYPES.GAUGE, 'Gauge');
    assert.strictEqual(ontology.ENTITY_TYPES.CITY, 'City');
  });

  it('should export new relation constants', () => {
    const ontology = require('../../core/registry/ontology');

    assert.strictEqual(ontology.RELATION_TYPES.DEPENDS_ON, 'depends_on');
    assert.strictEqual(ontology.RELATION_TYPES.OBSERVES, 'observes');
    assert.strictEqual(ontology.RELATION_TYPES.TRAINED_ON, 'trained_on');
  });

  it('should validate legacy and new types equally', () => {
    const ontology = require('../../core/registry/ontology');

    // Legacy types
    ontology.validateEntityType('Paper');
    ontology.validateEntityType('Dataset');

    // New types
    ontology.validateEntityType('Entity');
    ontology.validateEntityType('Basin');
    ontology.validateEntityType('River');

    // Invalid
    try {
      ontology.validateEntityType('NotAType');
      assert.fail('Should throw for invalid type');
    } catch (err) {
      assert.ok(err.message.includes('Invalid'), 'Should throw for invalid');
    }
  });

  it('should resolve LLM-facing type language through ontology protocol', () => {
    const ontology = require('../../core/registry/ontology');

    assert.deepStrictEqual(
      ontology.resolveEntityType('ModelObject'),
      {
        type: 'Model',
        originalType: 'ModelObject',
        changed: true,
        valid: true,
        reason: 'ontology-type'
      }
    );
    assert.strictEqual(ontology.resolveEntityType('Limitation').type, 'Uncertainty');
    assert.strictEqual(ontology.resolveEntityType('Gap').type, 'Uncertainty');
    assert.strictEqual(ontology.resolveEntityType('ResearchGap').type, 'Uncertainty');
    assert.strictEqual(ontology.resolveEntityType('FigureObject').type, 'Evidence');
    assert.strictEqual(ontology.resolveEntityType('Region').type, 'Region');
    assert.strictEqual(ontology.resolveEntityType('NotAType').valid, false);
  });

  it('should expose extraction type contracts from ontology', () => {
    const ontology = require('../../core/registry/ontology');
    const contract = ontology.getExtractionTypeContract();

    assert.ok(contract.capabilityObjects.includes('Model'));
    assert.ok(contract.worldObjects.includes('Region'));
    assert.ok(contract.evidenceObjects.includes('Evidence'));
    assert.ok(contract.routeNodes.includes('Method'));
    assert.strictEqual(contract.entityAliases.ModelObject, 'Model');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running five-layer ontology tests...');
}

module.exports = {};
