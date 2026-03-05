import type { FastifyInstance } from 'fastify'
import { desc, eq, and, gte } from 'drizzle-orm'
import { z } from 'zod'
import { protocolEvents } from '../db/schema'

const EVENT_TYPES = ['DEPOSIT', 'WITHDRAW', 'BORROW', 'REPAY', 'LIQUIDATION', 'SCORE_UPDATED', 'CREDIT_OPENED', 'CREDIT_CLOSED'] as const

export default async function eventsRoutes(app: FastifyInstance) {
  // GET /api/v1/events?type=DEPOSIT&since=2024-01-01&limit=50
  app.get<{
    Querystring: {
      type?:   string
      since?:  string
      limit?:  string
      offset?: string
    }
  }>(
    '/events',
    async (req, reply) => {
      const { type, since, limit: limitStr, offset: offsetStr } = req.query

      const limit  = Math.min(200, Math.max(1, parseInt(limitStr  ?? '50', 10)))
      const offset = Math.max(0, parseInt(offsetStr ?? '0', 10))

      const conditions = []

      if (type && EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])) {
        conditions.push(eq(protocolEvents.eventType, type))
      }

      if (since) {
        const sinceDate = new Date(since)
        if (!isNaN(sinceDate.getTime())) {
          conditions.push(gte(protocolEvents.createdAt, sinceDate))
        }
      }

      try {
        const rows = await app.db
          .select()
          .from(protocolEvents)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(protocolEvents.createdAt))
          .limit(limit)
          .offset(offset)

        return reply.send(
          rows.map(r => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          }))
        )
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: 'Failed to fetch events' })
      }
    }
  )
}
