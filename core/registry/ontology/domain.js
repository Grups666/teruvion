/**
 * Layer 4: Domain Extensions
 * Domain-specific extensions for specialized fields.
 *
 * This layer handles specific domains like Hydrology, Climate, Urban, Energy, Ecology, Agriculture.
 * These are optional extensions that add detailed entities and relations for each domain.
 *
 * Domains extend Layer 3 (World) entities with specialized attributes and relations.
 */

// ============================================================================
// DOMAIN EXTENSIONS
// ============================================================================

const DOMAIN_EXTENSIONS = {
  // ============================================================
  // HYDROLOGY DOMAIN
  // ============================================================
  hydrology: {
    name: 'hydrology',
    description: 'Hydrology and water resources domain',
    entities: {
      // Flow types
      River: {
        name: 'River',
        extends: 'EarthObject',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A river or stream',
        additionalRequired: [],
        additionalOptional: [
          'length', 'streamOrder', 'meanDischarge', 'slope',
          'sinuosity', 'bankfullWidth', 'sediment', 'waterQuality'
        ],
        additionalDefaults: {}
      },

      StreamReach: {
        name: 'StreamReach',
        extends: 'River',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A reach of a river',
        additionalRequired: [],
        additionalOptional: [
          'upstream', 'downstream', 'length', 'slope',
          'morphology', 'habitat'
        ],
        additionalDefaults: {}
      },

      // Observation types
      GaugeStation: {
        name: 'GaugeStation',
        extends: 'Gauge',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A stream gauge station',
        additionalRequired: ['stationId'],
        additionalOptional: [
          'river', 'basin', 'drainageArea', 'elevation',
          'operatingAgency', 'recordPeriod', 'dataQuality'
        ],
        additionalDefaults: {}
      },

      PrecipitationGauge: {
        name: 'PrecipitationGauge',
        extends: 'Gauge',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A precipitation gauge',
        additionalRequired: ['stationId'],
        additionalOptional: [
          'type', 'catchmentArea', 'heating', 'recordPeriod'
        ],
        additionalDefaults: {}
      },

      // Model types
      HydrologicalModel: {
        name: 'HydrologicalModel',
        extends: 'Model',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A hydrological model',
        additionalRequired: [],
        additionalOptional: [
          'modelType', 'spatialResolution', 'temporalResolution',
          'processes', 'parameters', 'forcings', 'states',
          'calibration', 'validation', 'performance'
        ],
        additionalDefaults: { modelType: 'distributed' }
      },

      RainfallRunoffModel: {
        name: 'RainfallRunoffModel',
        extends: 'HydrologicalModel',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A rainfall-runoff model',
        additionalRequired: [],
        additionalOptional: [
          'approach', 'evapotranspiration', 'infiltration',
          'routing', 'snowmelt'
        ],
        additionalDefaults: {}
      },

      GroundwaterModel: {
        name: 'GroundwaterModel',
        extends: 'HydrologicalModel',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A groundwater model',
        additionalRequired: [],
        additionalOptional: [
          'aquiferLayers', 'boundaryConditions', 'pumping',
          'recharge', 'flowType'
        ],
        additionalDefaults: {}
      },

      // Process types
      RunoffGeneration: {
        name: 'RunoffGeneration',
        extends: 'EarthProcess',
        layer: 'domain',
        domain: 'hydrology',
        description: 'Runoff generation process',
        additionalRequired: [],
        additionalOptional: [
          'mechanism', 'dominance', 'thresholds', 'controls'
        ],
        additionalDefaults: {}
      },

      Infiltration: {
        name: 'Infiltration',
        extends: 'EarthProcess',
        layer: 'domain',
        domain: 'hydrology',
        description: 'Infiltration process',
        additionalRequired: [],
        additionalOptional: [
          'rate', 'capacity', 'controls', 'modeling'
        ],
        additionalDefaults: {}
      },

      // Flood-specific
      FlashFlood: {
        name: 'FlashFlood',
        extends: 'FloodEvent',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A flash flood event',
        additionalRequired: [],
        additionalOptional: [
          'responseTime', 'peakTime', 'specificRunoff',
          'warningTime', 'fatalityRate'
        ],
        additionalDefaults: {}
      },

      RiverineFlood: {
        name: 'RiverineFlood',
        extends: 'FloodEvent',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A riverine flood event',
        additionalRequired: [],
        additionalOptional: [
          'peakStage', 'floodplainInundation', 'duration',
          'returnPeriod', 'forecastLeadTime'
        ],
        additionalDefaults: {}
      },

      // Water quality
      WaterQualityIndicator: {
        name: 'WaterQualityIndicator',
        extends: 'Indicator',
        layer: 'domain',
        domain: 'hydrology',
        description: 'A water quality indicator',
        additionalRequired: ['name', 'value'],
        additionalOptional: [
          'unit', 'standard', 'status', 'trend'
        ],
        additionalDefaults: {}
      }
    },
    relations: {
      discharges_to: {
        name: 'discharges_to',
        layer: 'domain',
        domain: 'hydrology',
        description: 'Subject discharges to the object',
        domain: ['River', 'Basin'],
        range: ['River', 'Lake', 'Ocean', 'Basin']
      },

      measured_at: {
        name: 'measured_at',
        layer: 'domain',
        domain: 'hydrology',
        description: 'Subject is measured at the object gauge',
        domain: ['Streamflow', 'Precipitation'],
        range: ['GaugeStation', 'Gauge']
      },

      models_basin: {
        name: 'models_basin',
        layer: 'domain',
        domain: 'hydrology',
        description: 'Subject model models the object basin',
        domain: ['HydrologicalModel'],
        range: ['Basin', 'Watershed']
      },

      routes_through: {
        name: 'routes_through',
        layer: 'domain',
        domain: 'hydrology',
        description: 'Subject routes through the object',
        domain: ['Streamflow', 'FloodWave'],
        range: ['River', 'StreamReach']
      }
    }
  },

  // ============================================================
  // CLIMATE DOMAIN
  // ============================================================
  climate: {
    name: 'climate',
    description: 'Climate science domain',
    entities: {
      ClimateZone: {
        name: 'ClimateZone',
        extends: 'Region',
        layer: 'domain',
        domain: 'climate',
        description: 'A climate zone',
        additionalRequired: [],
        additionalOptional: [
          'classification', 'characteristics', 'seasonality',
          'variability', 'change'
        ],
        additionalDefaults: {}
      },

      ClimateIndex: {
        name: 'ClimateIndex',
        extends: 'Index',
        layer: 'domain',
        domain: 'climate',
        description: 'A climate index (ENSO, NAO, etc.)',
        additionalRequired: ['name'],
        additionalOptional: [
          'definition', 'data', 'period', 'trend'
        ],
        additionalDefaults: {}
      },

      ENSO: {
        name: 'ENSO',
        extends: 'ClimateIndex',
        layer: 'domain',
        domain: 'climate',
        description: 'El Niño Southern Oscillation',
        additionalRequired: [],
        additionalOptional: [
          'phase', 'magnitude', 'onset', 'peak', 'decay'
        ],
        additionalDefaults: {}
      },

      ClimateModel: {
        name: 'ClimateModel',
        extends: 'Model',
        layer: 'domain',
        domain: 'climate',
        description: 'A climate model (GCM, RCM)',
        additionalRequired: [],
        additionalOptional: [
          'type', 'resolution', 'components', 'scenarios',
          'variables', 'bias', 'validation'
        ],
        additionalDefaults: {}
      },

      GCM: {
        name: 'GCM',
        extends: 'ClimateModel',
        layer: 'domain',
        domain: 'climate',
        description: 'A general circulation model',
        additionalRequired: [],
        additionalOptional: [
          'atmosphere', 'ocean', 'land', 'ice', 'coupling'
        ],
        additionalDefaults: {}
      },

      RCM: {
        name: 'RCM',
        extends: 'ClimateModel',
        layer: 'domain',
        domain: 'climate',
        description: 'A regional climate model',
        additionalRequired: [],
        additionalOptional: [
          'domain', 'parentGCM', 'resolution', 'downscaling'
        ],
        additionalDefaults: {}
      },

      ClimateProjection: {
        name: 'ClimateProjection',
        extends: 'Projection',
        layer: 'domain',
        domain: 'climate',
        description: 'A climate projection',
        additionalRequired: [],
        additionalOptional: [
          'scenario', 'model', 'variables', 'baseline',
          'changes', 'uncertainty'
        ],
        additionalDefaults: {}
      },

      ExtremesIndicator: {
        name: 'ExtremesIndicator',
        extends: 'Indicator',
        layer: 'domain',
        domain: 'climate',
        description: 'A climate extremes indicator',
        additionalRequired: ['name'],
        additionalOptional: [
          'definition', 'threshold', 'frequency', 'intensity'
        ],
        additionalDefaults: {}
      }
    },
    relations: {
      influences_climate: {
        name: 'influences_climate',
        layer: 'domain',
        domain: 'climate',
        description: 'Subject influences climate of the object',
        domain: ['ClimateIndex', 'Ocean'],
        range: ['Region', 'ClimateZone']
      },

      downscales_to: {
        name: 'downscales_to',
        layer: 'domain',
        domain: 'climate',
        description: 'Subject downscales to the object',
        domain: ['GCM', 'ClimateModel'],
        range: ['RCM', 'Region']
      },

      projects_climate: {
        name: 'projects_climate',
        layer: 'domain',
        domain: 'climate',
        description: 'Subject projects climate for the object',
        domain: ['ClimateModel', 'GCM'],
        range: ['Region', 'ClimateZone', 'Scenario']
      }
    }
  },

  // ============================================================
  // URBAN DOMAIN
  // ============================================================
  urban: {
    name: 'urban',
    description: 'Urban systems domain',
    entities: {
      City: {
        name: 'City',
        extends: 'Region',
        layer: 'domain',
        domain: 'urban',
        description: 'A city or urban area',
        additionalRequired: [],
        additionalOptional: [
          'population', 'area', 'density', 'country',
          'climate', 'infrastructure', 'hazards'
        ],
        additionalDefaults: {}
      },

      Building: {
        name: 'Building',
        extends: 'Infrastructure',
        layer: 'domain',
        domain: 'urban',
        description: 'A building',
        additionalRequired: [],
        additionalOptional: [
          'type', 'height', 'area', 'floors',
          'occupancy', 'value', 'vulnerability'
        ],
        additionalDefaults: {}
      },

      DrainageNetwork: {
        name: 'DrainageNetwork',
        extends: 'Infrastructure',
        layer: 'domain',
        domain: 'urban',
        description: 'An urban drainage network',
        additionalRequired: [],
        additionalOptional: [
          'pipes', 'capacity', 'designStorm', 'overflow',
          'maintenance', 'age'
        ],
        additionalDefaults: {}
      },

      UrbanFlood: {
        name: 'UrbanFlood',
        extends: 'FloodEvent',
        layer: 'domain',
        domain: 'urban',
        description: 'An urban flood event',
        additionalRequired: [],
        additionalOptional: [
          'type', 'depth', 'duration', 'area',
          'causes', 'damages', 'response'
        ],
        additionalDefaults: {}
      },

      TrafficFlow: {
        name: 'TrafficFlow',
        extends: 'EarthVariable',
        layer: 'domain',
        domain: 'urban',
        description: 'Traffic flow',
        additionalRequired: [],
        additionalOptional: [
          'volume', 'speed', 'congestion', 'pattern',
          'impacts'
        ],
        additionalDefaults: {}
      },

      UrbanHeatIsland: {
        name: 'UrbanHeatIsland',
        extends: 'Process',
        layer: 'domain',
        domain: 'urban',
        description: 'Urban heat island effect',
        additionalRequired: [],
        additionalOptional: [
          'intensity', 'spatialPattern', 'drivers',
          'mitigation', 'healthImpacts'
        ],
        additionalDefaults: {}
      }
    },
    relations: {
      located_in_city: {
        name: 'located_in_city',
        layer: 'domain',
        domain: 'urban',
        description: 'Subject is located in the object city',
        domain: ['Building', 'Infrastructure', 'Location'],
        range: ['City', 'Region']
      },

      served_by: {
        name: 'served_by',
        layer: 'domain',
        domain: 'urban',
        description: 'Subject is served by the object infrastructure',
        domain: ['Building', 'Area'],
        range: ['Infrastructure', 'DrainageNetwork']
      }
    }
  },

  // ============================================================
  // ENERGY DOMAIN
  // ============================================================
  energy: {
    name: 'energy',
    description: 'Energy systems domain',
    entities: {
      Substation: {
        name: 'Substation',
        extends: 'Infrastructure',
        layer: 'domain',
        domain: 'energy',
        description: 'An electrical substation',
        additionalRequired: [],
        additionalOptional: [
          'capacity', 'voltage', 'transformers', 'connections',
          'load', 'reliability'
        ],
        additionalDefaults: {}
      },

      TransmissionLine: {
        name: 'TransmissionLine',
        extends: 'Infrastructure',
        layer: 'domain',
        domain: 'energy',
        description: 'An electrical transmission line',
        additionalRequired: [],
        additionalOptional: [
          'length', 'voltage', 'capacity', 'route',
          'condition', 'hazards'
        ],
        additionalDefaults: {}
      },

      RenewableGeneration: {
        name: 'RenewableGeneration',
        extends: 'Infrastructure',
        layer: 'domain',
        domain: 'energy',
        description: 'A renewable generation facility',
        additionalRequired: [],
        additionalOptional: [
          'type', 'capacity', 'location', 'resource',
          'variability', 'gridConnection'
        ],
        additionalDefaults: {}
      },

      EnergyStorage: {
        name: 'EnergyStorage',
        extends: 'Infrastructure',
        layer: 'domain',
        domain: 'energy',
        description: 'An energy storage facility',
        additionalRequired: [],
        additionalOptional: [
          'type', 'capacity', 'duration', 'efficiency',
          'location', 'useCases'
        ],
        additionalDefaults: {}
      },

      EnergyDemand: {
        name: 'EnergyDemand',
        extends: 'EarthVariable',
        layer: 'domain',
        domain: 'energy',
        description: 'Energy demand',
        additionalRequired: [],
        additionalOptional: [
          'profile', 'peak', 'sectors', 'drivers',
          'forecasting', 'flexibility'
        ],
        additionalDefaults: {}
      },

      HydropowerPlant: {
        name: 'HydropowerPlant',
        extends: 'RenewableGeneration',
        layer: 'domain',
        domain: 'energy',
        description: 'A hydropower plant',
        additionalRequired: [],
        additionalOptional: [
          'dam', 'reservoir', 'capacity', 'turbines',
          'operation', 'river', 'basin'
        ],
        additionalDefaults: {}
      }
    },
    relations: {
      supplies_energy_to: {
        name: 'supplies_energy_to',
        layer: 'domain',
        domain: 'energy',
        description: 'Subject supplies energy to the object',
        domain: ['RenewableGeneration', 'PowerGrid'],
        range: ['Region', 'City', 'Infrastructure']
      },

      connected_to_grid: {
        name: 'connected_to_grid',
        layer: 'domain',
        domain: 'energy',
        description: 'Subject is connected to the object grid',
        domain: ['RenewableGeneration', 'Substation'],
        range: ['PowerGrid']
      },

      depends_on_water: {
        name: 'depends_on_water',
        layer: 'domain',
        domain: 'energy',
        description: 'Subject depends on water from the object',
        domain: ['HydropowerPlant', 'EnergyResource'],
        range: ['Basin', 'Reservoir', 'River']
      }
    }
  },

  // ============================================================
  // ECOLOGY DOMAIN
  // ============================================================
  ecology: {
    name: 'ecology',
    description: 'Ecology and ecosystems domain',
    entities: {
      Ecosystem: {
        name: 'Ecosystem',
        extends: 'EarthObject',
        layer: 'domain',
        domain: 'ecology',
        description: 'An ecosystem',
        additionalRequired: [],
        additionalOptional: [
          'type', 'area', 'biodiversity', 'services',
          'threats', 'condition', 'trends'
        ],
        additionalDefaults: {}
      },

      Vegetation: {
        name: 'Vegetation',
        extends: 'EarthVariable',
        layer: 'domain',
        domain: 'ecology',
        description: 'Vegetation characteristics',
        additionalRequired: [],
        additionalOptional: [
          'type', 'cover', 'biomass', 'health',
          'seasonality', 'change'
        ],
        additionalDefaults: {}
      },

      Habitat: {
        name: 'Habitat',
        extends: 'Region',
        layer: 'domain',
        domain: 'ecology',
        description: 'A habitat',
        additionalRequired: [],
        additionalOptional: [
          'species', 'conditions', 'connectivity',
          'quality', 'threats'
        ],
        additionalDefaults: {}
      },

      Species: {
        name: 'Species',
        extends: 'Entity',
        layer: 'domain',
        domain: 'ecology',
        description: 'A species',
        additionalRequired: ['name'],
        additionalOptional: [
          'taxonomy', 'status', 'population', 'distribution',
          'habitat', 'threats'
        ],
        additionalDefaults: {}
      },

      BiodiversityIndex: {
        name: 'BiodiversityIndex',
        extends: 'Index',
        layer: 'domain',
        domain: 'ecology',
        description: 'A biodiversity index',
        additionalRequired: ['name'],
        additionalOptional: [
          'components', 'methodology', 'baseline', 'trend'
        ],
        additionalDefaults: {}
      },

      CarbonSink: {
        name: 'CarbonSink',
        extends: 'Entity',
        layer: 'domain',
        domain: 'ecology',
        description: 'A carbon sink',
        additionalRequired: ['name'],
        additionalOptional: [
          'type', 'capacity', 'rate', 'location',
          'management', 'verification'
        ],
        additionalDefaults: {}
      },

      EcosystemService: {
        name: 'EcosystemService',
        extends: 'Entity',
        layer: 'domain',
        domain: 'ecology',
        description: 'An ecosystem service',
        additionalRequired: ['name'],
        additionalOptional: [
          'type', 'provider', 'beneficiaries', 'value',
          'condition', 'demand'
        ],
        additionalDefaults: {}
      }
    },
    relations: {
      provides_habitat_for: {
        name: 'provides_habitat_for',
        layer: 'domain',
        domain: 'ecology',
        description: 'Subject provides habitat for the object species',
        domain: ['Ecosystem', 'Habitat'],
        range: ['Species']
      },

      depends_on_ecosystem: {
        name: 'depends_on_ecosystem',
        layer: 'domain',
        domain: 'ecology',
        description: 'Subject depends on the object ecosystem',
        domain: ['Species', 'HumanActivity'],
        range: ['Ecosystem', 'Habitat']
      },

      sequesters_carbon: {
        name: 'sequesters_carbon',
        layer: 'domain',
        domain: 'ecology',
        description: 'Subject sequesters carbon',
        domain: ['Ecosystem', 'Vegetation'],
        range: ['CarbonSink']
      }
    }
  },

  // ============================================================
  // AGRICULTURE DOMAIN
  // ============================================================
  agriculture: {
    name: 'agriculture',
    description: 'Agriculture domain',
    entities: {
      Crop: {
        name: 'Crop',
        extends: 'Entity',
        layer: 'domain',
        domain: 'agriculture',
        description: 'A crop type',
        additionalRequired: ['name'],
        additionalOptional: [
          'type', 'season', 'waterRequirement', 'yield',
          'area', 'production', 'price'
        ],
        additionalDefaults: {}
      },

      CropYield: {
        name: 'CropYield',
        extends: 'EarthVariable',
        layer: 'domain',
        domain: 'agriculture',
        description: 'Crop yield',
        additionalRequired: [],
        additionalOptional: [
          'crop', 'area', 'production', 'trend',
          'variability', 'forecast'
        ],
        additionalDefaults: {}
      },

      IrrigationDemand: {
        name: 'IrrigationDemand',
        extends: 'EarthVariable',
        layer: 'domain',
        domain: 'agriculture',
        description: 'Irrigation water demand',
        additionalRequired: [],
        additionalOptional: [
          'volume', 'seasonality', 'crops', 'efficiency',
          'source', 'deficit'
        ],
        additionalDefaults: {}
      },

      SoilCondition: {
        name: 'SoilCondition',
        extends: 'EarthVariable',
        layer: 'domain',
        domain: 'agriculture',
        description: 'Soil condition for agriculture',
        additionalRequired: [],
        additionalOptional: [
          'type', 'depth', 'organicMatter', 'nutrients',
          'pH', 'erosion', 'salinity'
        ],
        additionalDefaults: {}
      },

      GrowingSeason: {
        name: 'GrowingSeason',
        extends: 'TimeRange',
        layer: 'domain',
        domain: 'agriculture',
        description: 'A growing season',
        additionalRequired: [],
        additionalOptional: [
          'crop', 'start', 'end', 'length',
          'GDD', 'frostFree'
        ],
        additionalDefaults: {}
      },

      AgriculturalDrought: {
        name: 'AgriculturalDrought',
        extends: 'DroughtEvent',
        layer: 'domain',
        domain: 'agriculture',
        description: 'An agricultural drought',
        additionalRequired: [],
        additionalOptional: [
          'affectedCrops', 'yieldLoss', 'soilMoistureDeficit',
          'duration', 'recovery'
        ],
        additionalDefaults: {}
      }
    },
    relations: {
      grows_in: {
        name: 'grows_in',
        layer: 'domain',
        domain: 'agriculture',
        description: 'Subject crop grows in the object',
        domain: ['Crop'],
        range: ['Region', 'ClimateZone', 'SoilCondition']
      },

      requires_irrigation: {
        name: 'requires_irrigation',
        layer: 'domain',
        domain: 'agriculture',
        description: 'Subject requires irrigation from the object',
        domain: ['Crop', 'GrowingSeason'],
        range: ['WaterResource', 'Basin', 'Aquifer']
      },

      affected_by_drought: {
        name: 'affected_by_drought',
        layer: 'domain',
        domain: 'agriculture',
        description: 'Subject is affected by the object drought',
        domain: ['Crop', 'CropYield'],
        range: ['AgriculturalDrought', 'DroughtEvent']
      }
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

let loadedDomains = { ...DOMAIN_EXTENSIONS };

function registerDomain(domainName, definition) {
  if (loadedDomains[domainName]) {
    console.warn(`Domain ${domainName} already exists, overwriting`);
  }
  if (!definition.name || !definition.entities) {
    throw new Error('Domain definition must have name and entities');
  }
  loadedDomains[domainName] = definition;
  return true;
}

function unregisterDomain(domainName) {
  if (DOMAIN_EXTENSIONS[domainName]) {
    console.warn(`Cannot unregister built-in domain: ${domainName}`);
    return false;
  }
  delete loadedDomains[domainName];
  return true;
}

function getDomain(domainName) {
  return loadedDomains[domainName] || null;
}

function getLoadedDomainNames() {
  return Object.keys(loadedDomains);
}

function isDomainEntity(typeName) {
  for (const domain of Object.values(loadedDomains)) {
    if (domain.entities && domain.entities[typeName]) {
      return true;
    }
  }
  return false;
}

function getDomainEntityInfo(typeName) {
  for (const [domainName, domain] of Object.entries(loadedDomains)) {
    const entityDef = domain.entities?.[typeName];
    if (entityDef) {
      return {
        domain: domainName,
        extends: entityDef.extends,
        definition: entityDef
      };
    }
  }
  return null;
}

const foundation = require('./foundation');
const world = require('./world');

function getDomainEntitySchema(typeName) {
  const info = getDomainEntityInfo(typeName);
  if (!info) return null;

  // Get parent schema - could be from foundation, world, or another domain
  let parentSchema = foundation.getEntitySchema(info.extends);
  if (!parentSchema) {
    parentSchema = world.getMergedSchema(info.extends);
  }
  if (!parentSchema) {
    parentSchema = getDomainEntitySchema(info.extends);
  }

  const def = info.definition;

  if (!parentSchema) {
    return {
      name: typeName,
      extends: info.extends,
      layer: 'domain',
      domain: info.domain,
      description: def.description,
      required: [...def.additionalRequired],
      optional: [...def.additionalOptional],
      defaults: { ...def.additionalDefaults }
    };
  }

  return {
    name: typeName,
    extends: info.extends,
    layer: 'domain',
    domain: info.domain,
    description: def.description,
    required: [...parentSchema.required, ...def.additionalRequired],
    optional: [...parentSchema.optional, ...def.additionalOptional],
    defaults: { ...parentSchema.defaults, ...def.additionalDefaults }
  };
}

function getDomainRelation(domainName, relationName) {
  const domain = loadedDomains[domainName];
  if (!domain) return null;
  return domain.relations?.[relationName] || null;
}

function getAllDomainEntities() {
  const entities = {};
  for (const [domainName, domain] of Object.entries(loadedDomains)) {
    if (domain.entities) {
      for (const [entityName, entityDef] of Object.entries(domain.entities)) {
        entities[entityName] = {
          ...entityDef,
          domain: domainName
        };
      }
    }
  }
  return entities;
}

function getAllDomainRelations() {
  const relations = {};
  for (const [domainName, domain] of Object.entries(loadedDomains)) {
    if (domain.relations) {
      for (const [relName, relDef] of Object.entries(domain.relations)) {
        relations[relName] = {
          ...relDef,
          domain: domainName
        };
      }
    }
  }
  return relations;
}

module.exports = {
  DOMAIN_EXTENSIONS,
  loadedDomains,
  registerDomain,
  unregisterDomain,
  getDomain,
  getLoadedDomainNames,
  isDomainEntity,
  getDomainEntityInfo,
  getDomainEntitySchema,
  getDomainRelation,
  getAllDomainEntities,
  getAllDomainRelations
};
