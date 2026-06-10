/**
 * Understanding Module Index
 * Connects ResearchUnderstanding to TripleStore
 */

const EntityMapper = require('./EntityMapper');
const TripleBuilder = require('./TripleBuilder');
const DigitalEarthDecomposer = require('./DigitalEarthDecomposer');
const DynamicOntologyActivation = require('./DynamicOntologyActivation');

module.exports = {
  EntityMapper,
  TripleBuilder,
  DigitalEarthDecomposer,
  DynamicOntologyActivation
};