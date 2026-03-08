/**
 * Shared test helpers — builds a Fastify app with mocked DB and Redis.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import type IORedis from 'ioredis'

/**
 * Creates a mock database object.
 * Each test should override the methods it cares about via mockDb.select / etc.
 */
export function createMockDb() {
  const chainable = () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      selectDistinctOn: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      offset: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }
    return chain
  }

  const db: any = {
    select: vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => {
          const inner: any = {
            where: vi.fn(() => {
              const w: any = {
                orderBy: vi.fn(() => {
                  const o: any = {
                    limit: vi.fn().mockResolvedValue([]),
                  }
                  return o
                }),
                limit: vi.fn().mockResolvedValue([]),
              }
              return w
            }),
            orderBy: vi.fn(() => {
              const o: any = {
                limit: vi.fn().mockResolvedValue([]),
              }
              return o
            }),
            limit: vi.fn().mockResolvedValue([]),
          }
          return inner
        }),
      }
      return chain
    }),
    selectDistinctOn: vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => {
          const inner: any = {
            orderBy: vi.fn().mockResolvedValue([]),
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue([]),
            })),
          }
          return inner
        }),
      }
      return chain
    }),
    execute: vi.fn().mockResolvedValue([]),
  }

  return db
}

/**
 * Creates a mock Redis object compatible with IORedis interface.
 */
export function createMockRedis(): any {
  const store: Record<string, string> = {}
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    set: vi.fn(async (key: string, value: string, _ex?: string, _ttl?: number) => {
      store[key] = value
      return 'OK'
    }),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store[key] = value
      return 'OK'
    }),
    incr: vi.fn(async (key: string) => {
      const val = parseInt(store[key] ?? '0', 10) + 1
      store[key] = String(val)
      return val
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (key: string) => { delete store[key]; return 1 }),
    quit: vi.fn(async () => 'OK'),
    connect: vi.fn(async () => {}),
    _store: store,
  }
}

/**
 * Builds a test Fastify instance with mocked db/redis decorators and
 * registered route plugins. No real DB or Redis connections are made.
 */
export async function buildTestApp(opts?: {
  routes?: Array<{ plugin: any; prefix?: string }>
  withAuth?: boolean
  db?: any
  redis?: any
}): Promise<FastifyInstance & { db: any; redis: any }> {
  const db = opts?.db ?? createMockDb()
  const redis = opts?.redis ?? createMockRedis()

  const app = Fastify({ logger: false })

  // Decorate with mocks instead of real plugins
  app.decorate('db', db)
  app.decorate('redis', redis)

  // Optionally add the auth hook
  if (opts?.withAuth) {
    const { createApiAuthHook } = await import('../middleware/apiAuth.js')
    app.addHook('preHandler', createApiAuthHook(db, redis))
  }

  // Register routes
  if (opts?.routes) {
    for (const r of opts.routes) {
      await app.register(r.plugin, { prefix: r.prefix ?? '/api/v1' })
    }
  }

  await app.ready()
  return app as FastifyInstance & { db: any; redis: any }
}
