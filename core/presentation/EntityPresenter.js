/**
 * Entity presentation helpers.
 *
 * This module keeps API-facing display contracts separate from route logic.
 * Core entities remain ontology objects; presenter output is the compact shape
 * that frontend panels, graphs, and inspectors can consume consistently.
 */

const defaultOntology = require('../registry/ontology');

function getEntityLayer(type, ontology = defaultOntology) {
  return ontology.getEntityLayer(type);
}

function getEntityCategory(type, ontology = defaultOntology) {
  return ontology.ENTITY_SCHEMAS?.[type]?.category || 'general';
}

function getEntityDisplayName(entity) {
  const attributes = entity?.attributes || {};
  return attributes.name
    || attributes.title
    || attributes.label
    || entity?.id;
}

function serializeEntity(entity, ontology = defaultOntology) {
  return {
    id: entity.id,
    type: entity.type,
    name: getEntityDisplayName(entity),
    layer: getEntityLayer(entity.type, ontology),
    category: getEntityCategory(entity.type, ontology),
    attributes: entity.attributes,
    metadata: entity.metadata,
    verificationState: entity.verificationState,
    createdAt: entity.createdAt
  };
}

function serializeEntitySummary(entity, ontology = defaultOntology) {
  return {
    id: entity.id,
    type: entity.type,
    name: getEntityDisplayName(entity),
    layer: getEntityLayer(entity.type, ontology),
    category: getEntityCategory(entity.type, ontology)
  };
}

function serializeRelatedEntity(entity, relation, direction, ontology = defaultOntology) {
  return {
    ...serializeEntitySummary(entity, ontology),
    relation,
    direction
  };
}

function isSourceEntity(entity, ontology = defaultOntology) {
  return getEntityLayer(entity.type, ontology) === 'source';
}

function getSourceLabel(entity) {
  return getEntityDisplayName(entity);
}

module.exports = {
  getEntityLayer,
  getEntityCategory,
  getEntityDisplayName,
  serializeEntity,
  serializeEntitySummary,
  serializeRelatedEntity,
  isSourceEntity,
  getSourceLabel
};
