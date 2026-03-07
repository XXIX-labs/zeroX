import type { PublicClient } from 'viem'
import type IORedis from 'ioredis'
import type { Logger } from 'pino'
import type { Database } from '../db'
import { VAULT_ABI } from '../abis'
import { runPollingLoop } from '../utils/blockPoller'
import { handleVaultEvents } from '../handlers/vaultHandler'
import { getConfig } from '../config'

export async function startVaultListener(
  client: PublicClient,
  redis: IORedis,
  db: Database,
  logger: Logger
): Promise<Array<() => void>> {
  const config = getConfig()

  const vaults: Array<{ address: string; token: string }> = [
    { address: config.VAULT_USDC_ADDRESS ?? '', token: 'USDC' },
    { address: config.VAULT_USDT_ADDRESS ?? '', token: 'USDT' },
  ].filter(v => v.address !== '')

  if (vaults.length === 0) {
    logger.warn('No vault addresses configured — vault listener disabled')
    return []
  }

  const stopFns: Array<() => void> = []

  for (const { address, token } of vaults) {
    const vaultLogger = logger.child({ contract: 'ZeroXVault', address, token })

    const stop = await runPollingLoop({
      redis,
      client,
      contractAddress: address,
      startBlock:      config.START_BLOCK,
      confirmationBlocks: config.CONFIRMATION_BLOCKS,
      batchSize:       config.BLOCK_BATCH_SIZE,
      pollIntervalMs:  config.POLL_INTERVAL_MS,
      logger:          vaultLogger,
      async processRange(from, to) {
        const logs = await client.getLogs({
          address:   address as `0x${string}`,
          events:    VAULT_ABI,
          fromBlock: from,
          toBlock:   to,
        })

        if (logs.length > 0) {
          vaultLogger.info({ count: logs.length, from: from.toString(), to: to.toString() }, 'Processing vault events')
          await handleVaultEvents(
            logs as Parameters<typeof handleVaultEvents>[0],
            address,
            token,
            db,
            vaultLogger
          )
        }
      },
    })

    stopFns.push(stop)
    vaultLogger.info({ from: config.START_BLOCK }, 'Vault listener started')
  }

  return stopFns
}
