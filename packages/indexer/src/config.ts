import { z } from 'zod'
import 'dotenv/config'

const schema = z.object({
  NODE_ENV:   z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL:  z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL:    z.string().default('redis://localhost:6379'),

  AVALANCHE_RPC_HTTP: z.string().url().default('https://api.avax.network/ext/bc/C/rpc'),
  AVALANCHE_RPC_WS:   z.string().url().default('wss://api.avax.network/ext/bc/C/ws'),

  CHAIN_ID: z.coerce.number().default(43114),

  // Contract addresses
  VAULT_USDC_ADDRESS: z.string().optional(),
  VAULT_USDT_ADDRESS: z.string().optional(),
  CREDIT_ADDRESS:     z.string().optional(),
  SCORE_ADDRESS:      z.string().optional(),

  // Indexer config
  START_BLOCK:         z.coerce.number().default(0),
  CONFIRMATION_BLOCKS: z.coerce.number().default(12),
  BLOCK_BATCH_SIZE:    z.coerce.number().default(2000),
  POLL_INTERVAL_MS:    z.coerce.number().default(3000),
})

export type Config = z.infer<typeof schema>

let _config: Config | undefined

export function getConfig(): Config {
  if (!_config) {
    const result = schema.safeParse(process.env)
    if (!result.success) {
      const errors = result.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n')
      throw new Error(`Invalid environment:\n${errors}`)
    }
    _config = result.data
  }
  return _config
}
