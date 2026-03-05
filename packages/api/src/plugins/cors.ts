import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { getConfig } from '../config'
import type { FastifyInstance } from 'fastify'

export default fp(async function corsPlugin(app: FastifyInstance) {
  const config = getConfig()
  await app.register(cors, {
    origin: config.NODE_ENV === 'production'
      ? config.CORS_ORIGIN.split(',').map(s => s.trim())
      : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
}, { name: 'cors' })
