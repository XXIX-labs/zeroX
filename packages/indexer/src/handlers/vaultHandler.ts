import { formatUnits } from 'viem'
import type { Log } from 'viem'
import type { Database } from '../db'
import { schema } from '../db'
import type { Logger } from 'pino'

type VaultEvent =
  | { eventName: 'Deposit';   args: { caller: `0x${string}`; owner: `0x${string}`; assets: bigint; shares: bigint } }
  | { eventName: 'Withdraw';  args: { caller: `0x${string}`; receiver: `0x${string}`; owner: `0x${string}`; assets: bigint; shares: bigint } }
  | { eventName: 'StrategyRebalanced'; args: { aaveAmount: bigint; benqiAmount: bigint } }
  | { eventName: 'YieldHarvested'; args: { yield: bigint } }

export async function handleVaultEvents(
  events: (Log & { eventName: string; args: Record<string, unknown> })[],
  vaultAddress: string,
  token: string,
  db: Database,
  logger: Logger
): Promise<void> {
  for (const event of events) {
    try {
      const base = {
        txHash:       event.transactionHash!,
        blockNumber:  Number(event.blockNumber!),
        logIndex:     event.logIndex ?? 0,
        vaultAddress: vaultAddress.toLowerCase(),
      }

      if (event.eventName === 'Deposit') {
        const { owner, assets } = event.args as { caller: `0x${string}`; owner: `0x${string}`; assets: bigint; shares: bigint }
        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType:   'DEPOSIT',
          userAddress: owner.toLowerCase(),
          amount:      formatUnits(assets, token === 'USDC' || token === 'USDT' ? 6 : 18),
        }).onConflictDoNothing()
        logger.debug({ tx: base.txHash, user: owner }, 'Vault Deposit indexed')
      }

      else if (event.eventName === 'Withdraw') {
        const { owner, assets } = event.args as { caller: `0x${string}`; receiver: `0x${string}`; owner: `0x${string}`; assets: bigint; shares: bigint }
        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType:   'WITHDRAW',
          userAddress: owner.toLowerCase(),
          amount:      formatUnits(assets, token === 'USDC' || token === 'USDT' ? 6 : 18),
        }).onConflictDoNothing()
        logger.debug({ tx: base.txHash, user: owner }, 'Vault Withdraw indexed')
      }

      else if (event.eventName === 'StrategyRebalanced') {
        const { aaveAmount, benqiAmount } = event.args as { aaveAmount: bigint; benqiAmount: bigint }
        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType: 'STRATEGY_REBALANCED',
          metadata:  JSON.stringify({ aaveAmount: aaveAmount.toString(), benqiAmount: benqiAmount.toString() }),
        }).onConflictDoNothing()
      }

      else if (event.eventName === 'YieldHarvested') {
        const { yield: yieldAmount } = event.args as { yield: bigint }
        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType: 'YIELD_HARVESTED',
          amount:    formatUnits(yieldAmount, 6),
        }).onConflictDoNothing()
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err: message, tx: event.transactionHash, event: event.eventName }, 'Failed to handle vault event')
    }
  }
}
