import type { FastifyInstance } from 'fastify'
import { getProtocolStats } from '../services/statsService'

export default async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', async (req, reply) => {
    try {
      const stats = await getProtocolStats(app.db, app.redis)
      return reply.send(stats)
    } catch (err) {
      app.log.error(err)
      return reply.status(500).send({ error: 'Failed to fetch stats' })
    }
  })
}
