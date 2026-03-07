import { formatUnits } from 'viem'
import type { Log } from 'viem'
import type { Database } from '../db'
import { schema } from '../db'
import type { Logger } from 'pino'
import { eq } from 'drizzle-orm'

export async function handleCreditEvents(
  events: (Log & { eventName: string; args: Record<string, unknown> })[],
  db: Database,
  logger: Logger
): Promise<void> {
  for (const event of events) {
    try {
      const base = {
        txHash:      event.transactionHash!,
        blockNumber: Number(event.blockNumber!),
        logIndex:    event.logIndex ?? 0,
      }

      if (event.eventName === 'CreditLineOpened') {
        const { user, collateralVault, collateralShares } = event.args as {
          user: `0x${string}`; collateralVault: `0x${string}`; collateralShares: bigint
        }

        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType:   'CREDIT_OPENED',
          userAddress: user.toLowerCase(),
          vaultAddress: collateralVault.toLowerCase(),
          metadata:    JSON.stringify({ collateralShares: collateralShares.toString() }),
        }).onConflictDoNothing()

        // Upsert credit position
        await db.insert(schema.creditPositions).values({
          userAddress:      user.toLowerCase(),
          collateralVault:  collateralVault.toLowerCase(),
          collateralShares: formatUnits(collateralShares, 18),
          isActive:         true,
          openedAt:         new Date(),
        }).onConflictDoUpdate({
          target: schema.creditPositions.userAddress,
          set: {
            collateralVault:  collateralVault.toLowerCase(),
            collateralShares: formatUnits(collateralShares, 18),
            isActive:         true,
            openedAt:         new Date(),
            lastUpdated:      new Date(),
          },
        })

        logger.info({ user, collateralVault }, 'CreditLineOpened')
      }

      else if (event.eventName === 'Borrowed') {
        const { user, amount } = event.args as { user: `0x${string}`; amount: bigint }

        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType:   'BORROW',
          userAddress: user.toLowerCase(),
          amount:      formatUnits(amount, 6),
        }).onConflictDoNothing()

        // Update principal (on-chain state is authoritative; this is approximate)
        const [existing] = await db
          .select({ principal: schema.creditPositions.principal })
          .from(schema.creditPositions)
          .where(eq(schema.creditPositions.userAddress, user.toLowerCase()))

        const currentPrincipal = parseFloat(existing?.principal ?? '0')
        const newPrincipal = currentPrincipal + parseFloat(formatUnits(amount, 6))

        await db.update(schema.creditPositions)
          .set({ principal: newPrincipal.toFixed(6), lastUpdated: new Date() })
          .where(eq(schema.creditPositions.userAddress, user.toLowerCase()))

        logger.debug({ user, amount: formatUnits(amount, 6) }, 'Borrowed')
      }

      else if (event.eventName === 'Repaid') {
        const { user, principal, interest } = event.args as {
          user: `0x${string}`; principal: bigint; interest: bigint
        }

        const totalRepaid = parseFloat(formatUnits(principal + interest, 6))

        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType:   'REPAY',
          userAddress: user.toLowerCase(),
          amount:      formatUnits(principal + interest, 6),
          metadata:    JSON.stringify({
            principal: formatUnits(principal, 6),
            interest:  formatUnits(interest, 6),
          }),
        }).onConflictDoNothing()

        const [existing] = await db
          .select({ principal: schema.creditPositions.principal })
          .from(schema.creditPositions)
          .where(eq(schema.creditPositions.userAddress, user.toLowerCase()))

        const remaining = Math.max(0, parseFloat(existing?.principal ?? '0') - parseFloat(formatUnits(principal, 6)))

        await db.update(schema.creditPositions)
          .set({
            principal:       remaining.toFixed(6),
            interestAccrued: '0',
            lastUpdated:     new Date(),
          })
          .where(eq(schema.creditPositions.userAddress, user.toLowerCase()))

        logger.debug({ user, totalRepaid }, 'Repaid')
      }

      else if (event.eventName === 'Liquidated') {
        const { user, liquidator, debt, collateralSeized } = event.args as {
          user: `0x${string}`; liquidator: `0x${string}`; debt: bigint; collateralSeized: bigint
        }

        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType:   'LIQUIDATION',
          userAddress: user.toLowerCase(),
          amount:      formatUnits(debt, 6),
          metadata:    JSON.stringify({
            liquidator:      liquidator,
            collateralSeized: formatUnits(collateralSeized, 18),
          }),
        }).onConflictDoNothing()

        await db.update(schema.creditPositions)
          .set({
            principal:       '0',
            interestAccrued: '0',
            healthStatus:    'LIQUIDATABLE',
            lastUpdated:     new Date(),
          })
          .where(eq(schema.creditPositions.userAddress, user.toLowerCase()))

        logger.warn({ user, liquidator, debt: formatUnits(debt, 6) }, 'Liquidated')
      }

      else if (event.eventName === 'CreditLineClosed') {
        const { user } = event.args as { user: `0x${string}` }

        await db.insert(schema.protocolEvents).values({
          ...base,
          eventType:   'CREDIT_CLOSED',
          userAddress: user.toLowerCase(),
        }).onConflictDoNothing()

        await db.update(schema.creditPositions)
          .set({ isActive: false, closedAt: new Date(), lastUpdated: new Date() })
          .where(eq(schema.creditPositions.userAddress, user.toLowerCase()))

        logger.info({ user }, 'CreditLineClosed')
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err: message, tx: event.transactionHash, event: event.eventName }, 'Failed to handle credit event')
    }
  }
}
