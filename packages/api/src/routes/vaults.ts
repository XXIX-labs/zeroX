import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getAllVaults, getVaultHistory } from '../services/vaultService'

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid address')

export default async function vaultRoutes(app: FastifyInstance) {
  // GET /api/v1/vaults
  app.get('/vaults', async (_req, reply) => {
    try {
      const vaults = await getAllVaults(app.db)
      return reply.send(vaults)
    } catch (err) {
      app.log.error(err)
      return reply.status(500).send({ error: 'Failed to fetch vaults' })
    }
  })

  // GET /api/v1/vaults/:address/history
  app.get<{ Params: { address: string }; Querystring: { days?: string } }>(
    '/vaults/:address/history',
    {
      schema: {
        params: {
          type: 'object',
          properties: { address: { type: 'string' } },
          required: ['address'],
        },
        querystring: {
          type: 'object',
          properties: { days: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const parsed = addressSchema.safeParse(req.params.address)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid vault address' })
      }

      const days = Math.min(90, Math.max(1, parseInt(req.query.days ?? '30', 10)))

      try {
        const history = await getVaultHistory(app.db, parsed.data, days)
        return reply.send(history)
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: 'Failed to fetch vault history' })
      }
    }
  )
}
