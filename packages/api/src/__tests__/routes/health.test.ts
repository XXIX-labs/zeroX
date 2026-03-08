import { describe, it, expect, afterEach } from 'vitest'
import { buildTestApp } from '../helpers.js'
import healthRoutes from '../../routes/health.js'
import type { FastifyInstance } from 'fastify'

describe('GET /api/v1/health', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app?.close()
  })

  it('should return 200 with status, version, and uptime', async () => {
    app = await buildTestApp({
      routes: [{ plugin: healthRoutes }],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('uptime')
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThan(0)
  })

  it('should return version string', async () => {
    app = await buildTestApp({
      routes: [{ plugin: healthRoutes }],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    const body = res.json()
    expect(typeof body.version).toBe('string')
  })

  it('should return JSON content type', async () => {
    app = await buildTestApp({
      routes: [{ plugin: healthRoutes }],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(res.headers['content-type']).toContain('application/json')
  })
})
