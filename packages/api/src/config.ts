import { z } from 'zod'
import 'dotenv/config'

const schema = z.object({
  NODE_ENV:      z.enum(['development', 'production', 'test']).default('development'),
  PORT:          z.coerce.number().default(3001),
  HOST:          z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL:  z.string().url(),

  // Redis
  REDIS_URL:     z.string().default('redis://localhost:6379'),

  // RPC
  AVALANCHE_RPC_HTTP: z.string().url().default('https://api.avax.network/ext/bc/C/rpc'),
  AVALANCHE_RPC_WS:   z.string().url().default('wss://api.avax.network/ext/bc/C/ws'),
  FUJI_RPC_HTTP:      z.string().url().default('https://api.avax-test.network/ext/bc/C/rpc'),

  // Chain
  CHAIN_ID: z.coerce.number().default(43114),

  // Contract addresses (required in production)
  VAULT_USDC_ADDRESS: z.string().optional(),
  VAULT_USDT_ADDRESS: z.string().optional(),
  CREDIT_ADDRESS:     z.string().optional(),
  SCORE_ADDRESS:      z.string().optional(),
  REGISTRY_ADDRESS:   z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Rate limit
  RATE_LIMIT_MAX:    z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  // SDK metering admin
  ADMIN_SECRET: z.string().default('change_me_in_production'),

  // Jobs
  ENABLE_JOBS: z.string().default('true').transform(v => v !== 'false' && v !== '0'),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().default(5 * 60 * 1000), // 5 min
})

export type Config = z.infer<typeof schema>

let _config: Config | undefined

export function getConfig(): Config {
  if (!_config) {
    const result = schema.safeParse(process.env)
    if (!result.success) {
      const errors = result.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n')
      throw new Error(`Invalid environment configuration:\n${errors}`)
    }
    _config = result.data
  }
  return _config
}
