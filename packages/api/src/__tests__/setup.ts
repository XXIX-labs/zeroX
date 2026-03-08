/**
 * Global test setup — set env vars before any module loads.
 * This runs before each test file.
 */

// Set required env vars so getConfig() succeeds
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/zerox_test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.NODE_ENV = 'test'
process.env.ENABLE_JOBS = 'false'
process.env.ADMIN_SECRET = 'test-secret'
