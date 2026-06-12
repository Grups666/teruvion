/**
 * ObjectReviewActions
 *
 * Builds generic user-facing review checks for an object.
 * The rules are based on ontology layer/category and graph structure, not
 * domain-specific entity names.
 */

function buildObjectReviewActions(entity, relations, ontology) {
  const actions = [
    'Inspect object metadata',
    'Review provenance'
  ];
  const layer = ontology.getEntityLayer(entity.type);
  const category = ontology.ENTITY_SCHEMAS[entity.type]?.category || 'general';
  const outgoingTypes = (relations.outgoing || []).map(r => r.predicate);
  const incomingTypes = (relations.incoming || []).map(r => r.predicate);
  const relationTypes = [...new Set([...outgoingTypes, ...incomingTypes])];

  if (layer === 'source') {
    actions.push('Review extracted objects');
    actions.push('Check source coverage');
  }

  if (layer === 'capability') {
    actions.push('Inspect linked world objects');
    actions.push('Check reusable workflow');
  }

  if (layer === 'world') {
    actions.push('Inspect spatial and temporal context');
    actions.push('Find connected capabilities');
  }

  if (layer === 'domain' || layer === 'extension') {
    actions.push('Review extension ontology role');
  }

  if (category && category !== 'general') {
    actions.push(`Review ${formatActionLabel(category)} evidence`);
  }

  if (relationTypes.length > 0) {
    actions.push('Trace graph connections');
  }

  if (relationTypes.length > 1) {
    actions.push('Compare connected objects');
  }

  for (const relationType of relationTypes.slice(0, 3)) {
    actions.push(`Inspect ${formatActionLabel(relationType)} relation`);
  }

  if (entity.metadata?.confidence !== undefined) {
    actions.push('Review extraction confidence');
  }

  return [...new Set(actions)];
}

function formatActionLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

module.exports = {
  buildObjectReviewActions,
  formatActionLabel
};
