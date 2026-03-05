import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getLatestScore, getScoreHistory } from '../services/scoreService'

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid address')

export default async function scoreRoutes(app: FastifyInstance) {
  // GET /api/v1/score/:userAddress
  app.get<{ Params: { userAddress: string } }>(
    '/score/:userAddress',
    async (req, reply) => {
      const parsed = addressSchema.safeParse(req.params.userAddress)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid user address' })
      }

      try {
        const score = await getLatestScore(app.db, parsed.data)
        if (!score) return reply.status(404).send({ error: 'No score found for this address' })
        return reply.send(score)
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: 'Failed to fetch score' })
      }
    }
  )

  // GET /api/v1/score/:userAddress/history
  app.get<{ Params: { userAddress: string }; Querystring: { days?: string } }>(
    '/score/:userAddress/history',
    async (req, reply) => {
      const parsed = addressSchema.safeParse(req.params.userAddress)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid user address' })
      }

      const days = Math.min(365, Math.max(1, parseInt(req.query.days ?? '90', 10)))

      try {
        const history = await getScoreHistory(app.db, parsed.data, days)
        return reply.send(history)
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: 'Failed to fetch score history' })
      }
    }
  )
}
