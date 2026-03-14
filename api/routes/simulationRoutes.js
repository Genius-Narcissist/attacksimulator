const { trackClick, trackFormSubmit, trackReport, getEventDetails } = require('../controllers/simulationTrackingController')

const path = require('path')
const fs = require('fs')

async function simulationRoutes(fastify, opts) {

  // Public routes — no auth, token is the security mechanism
  fastify.get('/sim/click/:token', trackClick)

  fastify.post('/sim/submit/:token', trackFormSubmit)

  fastify.post('/sim/report/:token', trackReport)

  fastify.get('/sim/event/:token', getEventDetails)


  // NEW: serve simulation media (e.g., phishing PDFs)
  fastify.get('/sim/media/:filename', async (request, reply) => {

    const { filename } = request.params

    const filePath = path.join(__dirname, '../uploads', filename)

    if (!fs.existsSync(filePath))
      return reply.status(404).send({ error: 'File not found' })

    const stream = fs.createReadStream(filePath)

    reply.header('Content-Type', 'application/pdf')

    return reply.send(stream)
  })

}

module.exports = simulationRoutes