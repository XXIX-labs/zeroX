import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../api/src/db/schema'
import { getConfig } from './config'

export type Database = ReturnType<typeof drizzle<typeof schema>>

let _db: Database | undefined
let _client: ReturnType<typeof postgres> | undefined

export function getDb(): Database {
  if (!_db) {
    const config = getConfig()
    _client = postgres(config.DATABASE_URL, { max: 5 })
    _db = drizzle(_client, { schema })
  }
  return _db
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end()
    _client = undefined
    _db = undefined
  }
}

export { schema }
