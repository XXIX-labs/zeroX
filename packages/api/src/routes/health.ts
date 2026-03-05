import type { FastifyInstance } from 'fastify'

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status:  { type: 'string' },
            version: { type: 'string' },
            uptime:  { type: 'number' },
          },
        },
      },
    },
  }, async () => ({
    status:  'ok',
    version: process.env.npm_package_version ?? '1.0.0',
    uptime:  process.uptime(),
  }))
}
