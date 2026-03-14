const Fastify = require('fastify')
require('dotenv').config()
const { connectDB } = require('./config/db')
const {
  initAuditChain,
  createAuditLog
} = require('./utils/auditLogger')

const orgRoutes = require('./routes/orgRoutes')

const app = Fastify({ logger: false })

const start = async () => {
  try {
    await app.register(require('@fastify/cors'), {
      origin: process.env.CLIENT_URL,
      credentials: true
    })

    await app.register(require('@fastify/helmet'), {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"]
        }
      }
    })

    await app.register(require('@fastify/cookie'))

    await app.register(require('@fastify/jwt'), {
      secret: process.env.JWT_SECRET,
      cookie: {
        cookieName: 'token',
        signed: false
      }
    })

    // STEP 9 addition
    await app.register(require('@fastify/multipart'), {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 }
    })

    await connectDB()
    await initAuditChain()

    app.register(require('./routes/authRoutes'))

    // STEP 9 addition
    app.register(orgRoutes, { prefix: '/api' })

    app.get('/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString()
    }))

    await app.listen({
      port: process.env.PORT || 5000,
      host: '0.0.0.0'
    })

    await createAuditLog({
      action: 'SERVER_START',
      outcome: 'SUCCESS',
      metadata: {
        port: process.env.PORT || 5000,
        environment: process.env.NODE_ENV
      }
    })

    console.log('AttackSimulator running on port 5000')

  } catch (err) {
    console.error('Startup failed:', err)
    process.exit(1)
  }
}

start()