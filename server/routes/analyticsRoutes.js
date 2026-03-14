const { authenticate } = require('../middleware/authenticate')
const { authorize } = require('../middleware/authorize')
const { getOrgDashboard, getScenarioAnalytics, getFinancialRisk, getKillChain } = require('../controllers/analyticsController')

async function analyticsRoutes(fastify, opts) {
  fastify.addHook('onRequest', authenticate)

  fastify.get('/orgs/:orgId/analytics/dashboard', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getOrgDashboard)
  fastify.get('/scenarios/:scenarioId/analytics', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getScenarioAnalytics)
  fastify.get('/orgs/:orgId/analytics/financial', { preHandler: [authorize(['admin', 'analyst'])] }, getFinancialRisk)
  fastify.get('/scenarios/:scenarioId/killchain', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getKillChain)
}

module.exports = analyticsRoutes
