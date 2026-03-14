const { authenticate } = require('../middleware/authenticate')
const { employeeLogin, employeeLogout, setPassword } = require('../controllers/employeeAuthController')
const { getMyProfile, getMyModules, getMyDebrief, getMyBadges } = require('../controllers/employeeDashboardController')
const { RateLimiterMemory } = require('rate-limiter-flexible')

const loginLimiter = new RateLimiterMemory({ points: 5, duration: 60 })

async function employeeAuthRoutes(fastify, opts) {
  // Public routes
  fastify.post('/employee/login', async (request, reply) => {
    try {
      await loginLimiter.consume(request.ip)
    } catch {
      return reply.status(429).send({ error: 'Too many login attempts. Try again in 1 minute.' })
    }
    return employeeLogin(request, reply)
  })

  fastify.post('/employee/logout', employeeLogout)
  fastify.post('/employee/set-password', setPassword)

  // Protected routes — employee must be logged in
  fastify.get('/me', { preHandler: [authenticate] }, getMyProfile)
  fastify.get('/me/modules', { preHandler: [authenticate] }, getMyModules)
  fastify.get('/me/debrief/:scenarioId', { preHandler: [authenticate] }, getMyDebrief)
  fastify.get('/me/badges', { preHandler: [authenticate] }, getMyBadges)
}

module.exports = employeeAuthRoutes