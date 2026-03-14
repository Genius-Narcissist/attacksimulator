const { authenticate } = require('../middleware/authenticate')
const { authorize } = require('../middleware/authorize')
const {
  createScenario, getScenario, listScenarios,
  launchScenario, terminateScenario, getScenarioResults
} = require('../controllers/scenarioController')

async function scenarioRoutes(fastify, opts) {
  fastify.addHook('onRequest', authenticate)

  fastify.post('/scenarios', { preHandler: [authorize(['admin'])] }, createScenario)
  fastify.get('/orgs/:orgId/scenarios', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, listScenarios)
  fastify.get('/scenarios/:scenarioId', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getScenario)
  fastify.post('/scenarios/:scenarioId/launch', { preHandler: [authorize(['admin'])] }, launchScenario)
  fastify.post('/scenarios/:scenarioId/terminate', { preHandler: [authorize(['admin', 'defender'])] }, terminateScenario)
  fastify.get('/scenarios/:scenarioId/results', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getScenarioResults)
}

module.exports = scenarioRoutes