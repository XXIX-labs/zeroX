import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getCreditPosition, getCreditHistory, getAtRiskPositions } from '../services/creditService'

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid address')

export default async function creditRoutes(app: FastifyInstance) {
  // GET /api/v1/credit/at-risk
  app.get('/credit/at-risk', async (_req, reply) => {
    try {
      const positions = await getAtRiskPositions(app.db)
      return reply.send(positions)
    } catch (err) {
      app.log.error(err)
      return reply.status(500).send({ error: 'Failed to fetch at-risk positions' })
    }
  })

  // GET /api/v1/credit/:userAddress
  app.get<{ Params: { userAddress: string } }>(
    '/credit/:userAddress',
    async (req, reply) => {
      const parsed = addressSchema.safeParse(req.params.userAddress)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid user address' })
      }

      try {
        const position = await getCreditPosition(app.db, parsed.data)
        if (!position) return reply.status(404).send({ error: 'No credit position found' })
        return reply.send(position)
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: 'Failed to fetch credit position' })
      }
    }
  )

  // GET /api/v1/credit/:userAddress/history
  app.get<{ Params: { userAddress: string }; Querystring: { limit?: string } }>(
    '/credit/:userAddress/history',
    async (req, reply) => {
      const parsed = addressSchema.safeParse(req.params.userAddress)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid user address' })
      }

      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10)))

      try {
        const history = await getCreditHistory(app.db, parsed.data, limit)
        return reply.send(history)
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: 'Failed to fetch credit history' })
      }
    }
  )
}
