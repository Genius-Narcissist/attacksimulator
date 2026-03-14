const { authenticate } = require('../middleware/authenticate')
const { authorize } = require('../middleware/authorize')
const { getOrgDashboard, getScenarioAnalytics, getFinancialRisk, getKillChain } = require('../controllers/analyticsController')

const { generateBoardReport } = require('../utils/reportGenerator')
const Organization = require('../models/Organization')
const Scenario = require('../models/Scenario')
const Employee = require('../models/Employee')
const SimulationEvent = require('../models/SimulationEvent')

async function analyticsRoutes(fastify, opts) {
  fastify.addHook('onRequest', authenticate)

  fastify.get('/orgs/:orgId/analytics/dashboard', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getOrgDashboard)
  fastify.get('/scenarios/:scenarioId/analytics', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getScenarioAnalytics)
  fastify.get('/orgs/:orgId/analytics/financial', { preHandler: [authorize(['admin', 'analyst'])] }, getFinancialRisk)
  fastify.get('/scenarios/:scenarioId/killchain', { preHandler: [authorize(['admin', 'analyst', 'defender'])] }, getKillChain)

  // NEW ROUTE
  fastify.get('/scenarios/:scenarioId/board-report', {
    preHandler: [authorize(['admin', 'analyst'])]
  }, async (request, reply) => {
    try {
      const scenario = await Scenario.findById(mongoSanitize(request.params.scenarioId))
      if (!scenario) return reply.status(404).send({ error: 'Scenario not found' })

      const org = await Organization.findById(scenario.organization)
      const compromisedEmployees = await Employee.find({
        _id: { $in: scenario.targetEmployees },
        isCompromised: true
      })

      const events = await SimulationEvent.find({ scenario: scenario._id })
        .populate('employee', 'displayName role department')

      const insuranceLimit = parseInt(request.query.insuranceLimit) || 2000000
      const pdfBuffer = await generateBoardReport({
        org,
        scenario,
        compromisedEmployees,
        events,
        insuranceLimit
      })

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="board-report-${scenario._id}.pdf"`)
      return reply.send(pdfBuffer)
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send({ error: 'Internal server error' })
    }
  })
}

module.exports = analyticsRoutes