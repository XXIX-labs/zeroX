import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Config (Zod validation)', () => {
  // We need to reimport getConfig each time because it caches _config
  let origEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    origEnv = { ...process.env }
    // Reset cached config module
    vi.resetModules()
  })

  afterEach(() => {
    process.env = origEnv
  })

  async function loadGetConfig() {
    const mod = await import('../config.js')
    return mod.getConfig
  }

  it('should parse a valid minimal environment', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    process.env.NODE_ENV = 'test'
    const getConfig = await loadGetConfig()
    const config = getConfig()

    expect(config.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db')
    expect(config.NODE_ENV).toBe('test')
    expect(config.PORT).toBe(3001)
    expect(config.HOST).toBe('0.0.0.0')
    expect(config.CHAIN_ID).toBe(43114)
    expect(config.RATE_LIMIT_MAX).toBe(100)
  })

  it('should apply default values for optional fields', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    // Remove env vars set by setup.ts so defaults are tested
    delete process.env.ADMIN_SECRET
    delete process.env.ENABLE_JOBS
    const getConfig = await loadGetConfig()
    const config = getConfig()

    expect(config.REDIS_URL).toBe('redis://localhost:6379')
    expect(config.CORS_ORIGIN).toBe('http://localhost:5173')
    expect(config.ADMIN_SECRET).toBe('change_me_in_production')
    expect(config.ENABLE_JOBS).toBe(true)
    expect(config.SNAPSHOT_INTERVAL_MS).toBe(300_000)
  })

  it('should throw on missing DATABASE_URL', async () => {
    delete process.env.DATABASE_URL
    const getConfig = await loadGetConfig()

    expect(() => getConfig()).toThrow('Invalid environment configuration')
  })

  it('should throw on invalid DATABASE_URL (not a valid URL)', async () => {
    process.env.DATABASE_URL = 'not-a-url'
    const getConfig = await loadGetConfig()

    expect(() => getConfig()).toThrow('Invalid environment configuration')
  })

  it('should throw on invalid NODE_ENV value', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    process.env.NODE_ENV = 'staging'
    const getConfig = await loadGetConfig()

    expect(() => getConfig()).toThrow('Invalid environment configuration')
  })

  it('should coerce PORT from string to number', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    process.env.PORT = '8080'
    const getConfig = await loadGetConfig()
    const config = getConfig()

    expect(config.PORT).toBe(8080)
    expect(typeof config.PORT).toBe('number')
  })

  it('should coerce CHAIN_ID from string to number', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    process.env.CHAIN_ID = '43113'
    const getConfig = await loadGetConfig()
    const config = getConfig()

    expect(config.CHAIN_ID).toBe(43113)
  })

  it('should coerce ENABLE_JOBS from string to boolean', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    process.env.ENABLE_JOBS = 'false'
    const getConfig = await loadGetConfig()
    const config = getConfig()

    expect(config.ENABLE_JOBS).toBe(false)
  })

  it('should accept valid contract addresses as optional', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    process.env.VAULT_USDC_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
    const getConfig = await loadGetConfig()
    const config = getConfig()

    expect(config.VAULT_USDC_ADDRESS).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(config.VAULT_USDT_ADDRESS).toBeUndefined()
  })

  it('should cache the config on second call', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
    const getConfig = await loadGetConfig()
    const c1 = getConfig()
    const c2 = getConfig()

    expect(c1).toBe(c2)
  })
})
