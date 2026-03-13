const {
  register,
  login,
  logout,
  getMe
} = require('../controllers/authController')
const { authenticate } = require('../middleware/authenticate')
const { RateLimiterRedis } = require('rate-limiter-flexible')
const redis = require('../config/redis')

const authLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'auth_limit',
  points: 5,
  duration: 900,
  blockDuration: 900
})

const authRateLimit = async (req, reply) => {
  try {
    await authLimiter.consume(req.ip)
  } catch {
    return reply.status(429).send({
      error: 'Too many attempts — try again in 15 minutes'
    })
  }
}

async function authRoutes(fastify) {
  fastify.post('/api/auth/register',
    { preHandler: [authRateLimit] },
    register
  )

  fastify.post('/api/auth/login',
    { preHandler: [authRateLimit] },
    login
  )

  fastify.post('/api/auth/logout',
    { preHandler: [authenticate] },
    logout
  )

  fastify.get('/api/auth/me',
    { preHandler: [authenticate] },
    getMe
  )
}

module.exports = authRoutes
