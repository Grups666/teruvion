/**
 * Triple Builder
 * Builds triples from mapped entities based on ontology relations
 *
 * Supports Five-Layer Ontology:
 * - Foundation relations (supports, contradicts, derives_from)
 * - Source relations (cites, references, has_dataset)
 * - Capability relations (uses, produces, implements)
 * - World relations (drains_to, affects, located_at)
 * - Bridge relations (Capability ↔ World connections)
 */

const ontology = require('../registry/ontology');

class TripleBuilder {
  constructor(store) {
    this.store = store;
  }

  /**
   * Build triples connecting entities based on decomposition structure
   * @param {string} sourceEntityId - ID of the primary source entity
   * @param {Object} entityCollections - Collections of mapped entities by type
   * @param {Object} understanding - Original understanding output
   * @returns {Array} Array of triple specifications
   */
  build(sourceEntityId, entityCollections, understanding) {
    const triples = [];

    // Source uses Datasets
    if (entityCollections.datasets) {
      for (const ds of entityCollections.datasets) {
        triples.push({
          subject: sourceEntityId,
          predicate: 'uses',
          object: ds.id,
          metadata: {
            confidence: ds.metadata?.confidence || 0.8,
            sourceSection: 'datasets',
            role: ds.attributes?.role || 'input'
          }
        });
      }
    }

    // Source applies Methods/Models
    if (entityCollections.methods) {
      for (const method of entityCollections.methods) {
        triples.push({
          subject: sourceEntityId,
          predicate: 'applies',
          object: method.id,
          metadata: {
            confidence: method.metadata?.confidence || 0.8,
            sourceSection: 'methods'
          }
        });
      }
    }

    // Source studies Regions
    if (entityCollections.regions) {
      for (const region of entityCollections.regions) {
        triples.push({
          subject: sourceEntityId,
          predicate: 'studies',
          object: region.id,
          metadata: {
            confidence: region.metadata?.confidence || 0.8,
            sourceSection: 'spatial'
          }
        });
      }
    }

    // Source consists_of Experiments (for code/workflows)
    if (entityCollections.experiments) {
      for (const exp of entityCollections.experiments) {
        triples.push({
          subject: sourceEntityId,
          predicate: 'consists_of',
          object: exp.id,
          metadata: {
            confidence: exp.metadata?.confidence || 0.8,
            sourceSection: 'experiments'
          }
        });
      }
    }

    // Claims are derived_from Source
    if (entityCollections.claims) {
      for (const claim of entityCollections.claims) {
        triples.push({
          subject: claim.id,
          predicate: 'derives_from',
          object: sourceEntityId,
          metadata: {
            confidence: claim.attributes?.confidence || 0.8,
            sourceSection: 'claims'
          }
        });
      }
    }

    // Results support Claims
    if (entityCollections.results && entityCollections.claims) {
      for (const claim of entityCollections.claims) {
        if (claim.attributes?.evidence) {
          triples.push({
            subject: sourceEntityId,
            predicate: 'supports',
            object: claim.id,
            metadata: {
              confidence: claim.attributes?.confidence || 0.8,
              evidence: claim.attributes?.evidence
            }
          });
        }
      }
    }

    // Methods use Datasets (workflow chain)
    if (entityCollections.methods && entityCollections.datasets) {
      for (const method of entityCollections.methods) {
        const methodDs = method.attributes?.trainingData || method.attributes?.inputData;
        if (methodDs) {
          for (const ds of entityCollections.datasets) {
            if (methodDs.some(d => d.name === ds.attributes?.name || d === ds.attributes?.name)) {
              triples.push({
                subject: method.id,
                predicate: 'uses',
                object: ds.id,
                metadata: {
                  confidence: 0.9,
                  sourceSection: 'methods'
                }
              });
            }
          }
        }
      }
    }

    // Datasets cover Regions
    if (entityCollections.datasets && entityCollections.regions) {
      for (const ds of entityCollections.datasets) {
        for (const region of entityCollections.regions) {
          triples.push({
            subject: ds.id,
            predicate: 'covers',
            object: region.id,
            metadata: {
              confidence: 0.7,
              sourceSection: 'spatial'
            }
          });
        }
      }
    }

    // Models trained_on Datasets (for ML sources)
    if (entityCollections.models && entityCollections.datasets) {
      for (const model of entityCollections.models) {
        if (model.attributes?.trainingData) {
          for (const ds of entityCollections.datasets) {
            triples.push({
              subject: model.id,
              predicate: 'trained_on',
              object: ds.id,
              metadata: {
                confidence: 0.9,
                sourceSection: 'methods'
              }
            });
          }
        }
      }
    }

    // Add reproducibility grade triple
    if (understanding.reproducibility?.grade) {
      triples.push({
        subject: sourceEntityId,
        predicate: 'evaluated_by',
        object: understanding.reproducibility.grade,
        metadata: {
          confidence: 0.9,
          sourceSection: 'reproducibility',
          gradeReason: understanding.reproducibility.gradeReason
        }
      });
    }

    return triples;
  }

  /**
   * Build triples from Digital Earth decomposition result
   * @param {Object} decompositionResult - Output from DigitalEarthDecomposer
   * @returns {Object} Triples organized by relation type
   */
  buildFromDecomposition(decompositionResult) {
    const triples = {
      sourceToCapabilities: [],
      capabilityToWorld: [],
      worldToEvidence: [],
      bridgeRelations: [],
      all: []
    };

    const sourceId = decompositionResult.sourceObject?.id;
    if (!sourceId) return triples;

    // Source → Capability relations
    for (const cap of decompositionResult.capabilityObjects) {
      const predicate = this._getPredicateForCapability(cap.type);
      triples.sourceToCapabilities.push({
        subject: sourceId,
        predicate,
        object: cap.id,
        layer: 'source-to-capability',
        metadata: {
          confidence: cap.metadata?.confidence || 0.8,
          sourceSection: cap.provenance?.section || 'methods'
        }
      });
    }

    // Bridge relations (Capability ↔ World)
    for (const bridge of decompositionResult.bridgeRelations) {
      triples.capabilityToWorld.push({
        subject: bridge.from,
        predicate: bridge.type,
        object: bridge.to,
        layer: 'capability-to-world',
        metadata: {
          confidence: bridge.confidence || 0.7,
          sourceSection: bridge.provenance?.section || 'text'
        }
      });
    }

    // World → Evidence relations
    for (const evidence of decompositionResult.evidenceObjects) {
      if (evidence.metadata?.supportsClaim) {
        triples.worldToEvidence.push({
          subject: evidence.id,
          predicate: 'supports',
          object: evidence.metadata.supportsClaim,
          layer: 'world-to-evidence',
          metadata: {
            confidence: evidence.metadata?.confidence || 0.8,
            sourceSection: evidence.provenance?.section || 'results'
          }
        });
      }
    }

    // Combine all
    triples.all = [
      ...triples.sourceToCapabilities,
      ...triples.capabilityToWorld,
      ...triples.worldToEvidence,
      ...triples.bridgeRelations
    ];

    return triples;
  }

  /**
   * Get appropriate predicate for capability type
   */
  _getPredicateForCapability(capabilityType) {
    const predicateMap = {
      'Dataset': 'uses',
      'Variable': 'analyzes',
      'Model': 'applies',
      'Algorithm': 'implements',
      'Simulation': 'runs',
      'Sensor': 'uses',
      'Satellite': 'uses',
      'Gauge': 'uses',
      'Station': 'uses',
      'Software': 'depends_on',
      'API': 'integrates_with',
      'Workflow': 'follows',
      'Pipeline': 'executes',
      'Policy': 'complies_with',
      'Regulation': 'subject_to',
      'Institution': 'associated_with',
      'Assessment': 'evaluated_by',
      'Indicator': 'measured_by',
      'Intervention': 'proposes',
      'AdaptationMeasure': 'recommends'
    };
    return predicateMap[capabilityType] || 'uses';
  }

  /**
   * Build bridge relations between capability and world objects
   * @param {Array} capabilityObjects - Capability entities
   * @param {Array} worldObjects - World entities
   * @returns {Array} Bridge relation triples
   */
  buildBridgeRelations(capabilityObjects, worldObjects) {
    const relations = [];

    for (const cap of capabilityObjects) {
      for (const world of worldObjects) {
        const bridgeType = this._determineBridgeType(cap.type, world.type);
        if (bridgeType) {
          relations.push({
            subject: cap.id,
            predicate: bridgeType,
            object: world.id,
            layer: 'bridge',
            metadata: {
              confidence: 0.75,
              bridgeType: 'capability-to-world'
            }
          });
        }
      }
    }

    return relations;
  }

  /**
   * Determine bridge relation type between capability and world entities
   */
  _determineBridgeType(capabilityType, worldType) {
    const bridgeMatrix = {
      // Data capabilities → World objects
      'Dataset': {
        'Basin': 'covers',
        'Region': 'covers',
        'Watershed': 'covers',
        'Glacier': 'covers',
        'Lake': 'covers',
        'EarthVariable': 'contains',
        'Streamflow': 'contains',
        'Precipitation': 'contains'
      },
      // Observation capabilities → World objects
      'Satellite': {
        'EarthVariable': 'observes',
        'Streamflow': 'observes',
        'Precipitation': 'observes',
        'Temperature': 'observes',
        'Basin': 'observes',
        'Region': 'observes'
      },
      'Gauge': {
        'Streamflow': 'measures',
        'River': 'located_at',
        'Basin': 'located_at'
      },
      'Station': {
        'EarthVariable': 'measures',
        'Temperature': 'measures',
        'Precipitation': 'measures',
        'Region': 'located_at'
      },
      // Modeling capabilities → World objects
      'Model': {
        'Basin': 'simulates',
        'Watershed': 'simulates',
        'River': 'simulates',
        'Streamflow': 'predicts',
        'Precipitation': 'predicts',
        'FloodEvent': 'forecasts',
        'DroughtEvent': 'forecasts'
      },
      'Simulation': {
        'Basin': 'simulates',
        'Region': 'simulates'
      },
      // Governance capabilities → World objects
      'Policy': {
        'Region': 'applies_to',
        'Basin': 'applies_to',
        'EarthRisk': 'addresses',
        'FloodRisk': 'mitigates',
        'DroughtRisk': 'mitigates'
      },
      'Institution': {
        'Region': 'jurisdiction_over',
        'Basin': 'jurisdiction_over'
      },
      // Action capabilities → World objects
      'Intervention': {
        'EarthRisk': 'reduces',
        'FloodRisk': 'reduces',
        'DroughtRisk': 'reduces',
        'Region': 'targets'
      },
      'AdaptationMeasure': {
        'FloodRisk': 'mitigates',
        'DroughtRisk': 'mitigates',
        'Heatwave': 'addresses'
      },
      // Evidence capabilities → World objects
      'Assessment': {
        'Region': 'evaluates',
        'Basin': 'evaluates',
        'EarthRisk': 'assesses'
      }
    };

    return bridgeMatrix[capabilityType]?.[worldType] || null;
  }

  /**
   * Add triples to store
   * @param {Array} triples - Array of triple specifications
   * @returns {Array} Array of created triple IDs
   */
  addToStore(triples) {
    const tripleIds = [];

    for (const tripleSpec of triples) {
      try {
        const tripleId = this.store.addTriple(
          tripleSpec.subject,
          tripleSpec.predicate,
          tripleSpec.object,
          tripleSpec.metadata
        );
        tripleIds.push(tripleId);
      } catch (err) {
        console.warn(`Failed to add triple: ${err.message}`);
      }
    }

    return tripleIds;
  }

  /**
   * Build and add triples in one step
   * @param {string} sourceEntityId - Source entity ID
   * @param {Object} entityCollections - Entity collections
   * @param {Object} understanding - Understanding output
   * @returns {Object} Result with triple IDs and stats
   */
  buildAndAdd(sourceEntityId, entityCollections, understanding) {
    const triples = this.build(sourceEntityId, entityCollections, understanding);
    const tripleIds = this.addToStore(triples);

    return {
      triples: triples,
      tripleIds: tripleIds,
      stats: {
        total: triples.length,
        added: tripleIds.length,
        failed: triples.length - tripleIds.length,
        byRelation: this._countByRelation(triples)
      }
    };
  }

  /**
   * Build and add decomposition triples
   * @param {Object} decompositionResult - Decomposition result
   * @returns {Object} Result with triple IDs and stats
   */
  buildAndAddDecomposition(decompositionResult) {
    const triplesData = this.buildFromDecomposition(decompositionResult);
    const tripleIds = this.addToStore(triplesData.all);

    return {
      triples: triplesData,
      tripleIds: tripleIds,
      stats: {
        total: triplesData.all.length,
        added: tripleIds.length,
        failed: triplesData.all.length - tripleIds.length,
        byType: {
          sourceToCapabilities: triplesData.sourceToCapabilities.length,
          capabilityToWorld: triplesData.capabilityToWorld.length,
          worldToEvidence: triplesData.worldToEvidence.length
        },
        byRelation: this._countByRelation(triplesData.all)
      }
    };
  }

  _countByRelation(triples) {
    const counts = {};
    for (const t of triples) {
      counts[t.predicate] = (counts[t.predicate] || 0) + 1;
    }
    return counts;
  }
}

module.exports = TripleBuilder;