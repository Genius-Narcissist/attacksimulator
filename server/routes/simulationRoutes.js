const { trackClick, trackFormSubmit, trackReport, getEventDetails } = require('../controllers/simulationTrackingController')

async function simulationRoutes(fastify, opts) {
  // Public routes — no auth, token is the security mechanism
  fastify.get('/sim/click/:token', trackClick)
  fastify.post('/sim/submit/:token', trackFormSubmit)
  fastify.post('/sim/report/:token', trackReport)
  fastify.get('/sim/event/:token', getEventDetails)
}

module.exports = simulationRoutes