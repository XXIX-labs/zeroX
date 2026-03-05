import type { FastifyInstance } from 'fastify'
import { getLeaderboard } from '../services/scoreService'

export default async function leaderboardRoutes(app: FastifyInstance) {
  // GET /api/v1/leaderboard?page=1&limit=20
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/leaderboard',
    async (req, reply) => {
      const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10))
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)))

      try {
        const result = await getLeaderboard(app.db, app.redis, page, limit)
        return reply.send(result)
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: 'Failed to fetch leaderboard' })
      }
    }
  )
}
