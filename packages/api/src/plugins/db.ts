import fp from 'fastify-plugin'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'
import { getConfig } from '../config'
import type { FastifyInstance } from 'fastify'

export type Database = ReturnType<typeof drizzle<typeof schema>>

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
  }
}

export default fp(async function dbPlugin(app: FastifyInstance) {
  const config = getConfig()
  const client = postgres(config.DATABASE_URL, { max: 10 })
  const db = drizzle(client, { schema })

  app.decorate('db', db)

  app.addHook('onClose', async () => {
    await client.end()
  })

  app.log.info('PostgreSQL connected')
}, { name: 'db' })
