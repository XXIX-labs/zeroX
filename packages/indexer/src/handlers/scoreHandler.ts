import type { Log } from 'viem'
import type { Database } from '../db'
import { schema } from '../db'
import type { Logger } from 'pino'
import { eq } from 'drizzle-orm'

const CREDIT_EVENT_TYPES = [
  'DEPOSIT', 'WITHDRAWAL', 'BORROW', 'REPAY_ONTIME', 'REPAY_LATE',
  'LIQUIDATION', 'COLLATERAL_ADDED', 'CREDIT_LINE_OPENED', 'CREDIT_LINE_CLOSED',
] as const

function getRiskTier(score: number): string {
  if (score >= 750) return 'EXCELLENT'
  if (score >= 700) return 'VERY_GOOD'
  if (score >= 650) return 'GOOD'
  if (score >= 580) return 'FAIR'
  return 'POOR'
}

export async function handleScoreEvents(
  events: (Log & { eventName: string; args: Record<string, unknown> })[],
  db: Database,
  logger: Logger
): Promise<void> {
  for (const event of events) {
    try {
      if (event.eventName === 'ScoreUpdated') {
        const { user, newScore, trigger } = event.args as {
          user: `0x${string}`; oldScore: number; newScore: number; trigger: number
        }

        const triggerName = CREDIT_EVENT_TYPES[trigger] ?? 'UNKNOWN'
        const riskTier = getRiskTier(newScore)

        await db.insert(schema.userScores).values({
          userAddress:  user.toLowerCase(),
          score:        newScore,
          riskTier,
          triggerEvent: triggerName,
        })

        // Emit an event record too
        await db.insert(schema.protocolEvents).values({
          txHash:      event.transactionHash!,
          blockNumber: Number(event.blockNumber!),
          logIndex:    event.logIndex ?? 0,
          eventType:   'SCORE_UPDATED',
          userAddress: user.toLowerCase(),
          metadata:    JSON.stringify({ newScore, trigger: triggerName, riskTier }),
        }).onConflictDoNothing()

        logger.debug({ user, newScore, riskTier }, 'ScoreUpdated')
      }

      else if (event.eventName === 'SignalsUpdated') {
        const { user, signals } = event.args as { user: `0x${string}`; signals: number[] }

        // Update the latest score row with new signals
        const [latest] = await db
          .select({ id: schema.userScores.id })
          .from(schema.userScores)
          .where(eq(schema.userScores.userAddress, user.toLowerCase()))
          .orderBy(schema.userScores.computedAt)
          .limit(1)

        if (latest && signals.length >= 5) {
          // Insert a new row with updated signals but same score (signals update may precede score update)
          await db.update(schema.userScores)
            .set({
              repaymentSignal:   signals[0] ?? null,
              utilizationSignal: signals[1] ?? null,
              accountAgeSignal:  signals[2] ?? null,
              collateralSignal:  signals[3] ?? null,
              diversifySignal:   signals[4] ?? null,
            })
            .where(eq(schema.userScores.id, latest.id))
        }

        logger.debug({ user }, 'SignalsUpdated')
      }

      else if (event.eventName === 'ScoreInitialized') {
        const { user, initialScore } = event.args as { user: `0x${string}`; initialScore: number }

        await db.insert(schema.userScores).values({
          userAddress:  user.toLowerCase(),
          score:        initialScore,
          riskTier:     getRiskTier(initialScore),
          triggerEvent: 'INIT',
        })

        logger.info({ user, initialScore }, 'ScoreInitialized')
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ err: message, event: event.eventName }, 'Failed to handle score event')
    }
  }
}
