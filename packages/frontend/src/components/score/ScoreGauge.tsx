import { useEffect, useState } from 'react'
import { getTierForScore, GAUGE_SEGMENTS, GAUGE_MIN_SCORE, GAUGE_MAX_SCORE } from '../../lib/scoreUtils'

interface ScoreGaugeProps {
  score: number
  size?: number
  showLabel?: boolean
  animate?: boolean
}

// SVG arc helper: convert polar to Cartesian
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

// Build SVG arc path
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, endDeg)
  const end = polarToCartesian(cx, cy, r, startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

// Map score to angle: 300 = -130deg, 850 = +130deg (260deg sweep, starting from bottom-left)
const GAUGE_START_ANGLE = 140  // degrees from top (CSS convention)
const GAUGE_END_ANGLE = 400    // 140 + 260
const GAUGE_TRACK_START = -130 // SVG convention (from right/3 o'clock)
const GAUGE_TRACK_END = 130

function scoreToAngle(score: number): number {
  const clamped = Math.max(GAUGE_MIN_SCORE, Math.min(GAUGE_MAX_SCORE, score))
  const pct = (clamped - GAUGE_MIN_SCORE) / (GAUGE_MAX_SCORE - GAUGE_MIN_SCORE)
  return GAUGE_TRACK_START + pct * (GAUGE_TRACK_END - GAUGE_TRACK_START)
}

// Map segment score range to start/end angles
function segmentAngles(fromScore: number, toScore: number) {
  return {
    start: scoreToAngle(fromScore),
    end: scoreToAngle(toScore),
  }
}

export function ScoreGauge({ score, size = 240, showLabel = true, animate = true }: ScoreGaugeProps) {
  const [displayScore, setDisplayScore] = useState(animate ? GAUGE_MIN_SCORE : score)
  const [mounted, setMounted] = useState(false)

  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.42
  const trackR = size * 0.38
  const innerR = size * 0.30

  useEffect(() => {
    setMounted(true)
    if (!animate) return

    // Animate score from 300 to target
    const start = GAUGE_MIN_SCORE
    const target = score
    const duration = 900
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(start + (target - start) * eased)
      setDisplayScore(current)
      if (progress < 1) requestAnimationFrame(tick)
    }

    const raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score, animate])

  const tier = getTierForScore(displayScore)
  const needleAngle = scoreToAngle(displayScore)

  // Needle tip coordinates
  const needleTipAngle = needleAngle + 90 // adjust for SVG rotation
  const needleTipRad = (needleAngle * Math.PI) / 180
  const needleLength = outerR - 8
  const needleTip = {
    x: cx + needleLength * Math.cos(needleTipRad),
    y: cy + needleLength * Math.sin(needleTipRad),
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {/* Background track */}
          <path
            d={arcPath(cx, cy, trackR, GAUGE_TRACK_START, GAUGE_TRACK_END)}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={size * 0.055}
            strokeLinecap="round"
          />

          {/* Colored segments */}
          {GAUGE_SEGMENTS.map((seg, i) => {
            const { start, end } = segmentAngles(seg.from, seg.to)
            return (
              <path
                key={i}
                d={arcPath(cx, cy, trackR, start, end)}
                fill="none"
                stroke={seg.color}
                strokeWidth={size * 0.055}
                strokeLinecap={i === 0 ? 'round' : i === GAUGE_SEGMENTS.length - 1 ? 'round' : 'butt'}
                opacity={0.85}
              />
            )
          })}

          {/* Active score overlay — bright highlight up to current score */}
          {displayScore > GAUGE_MIN_SCORE && (
            <path
              d={arcPath(cx, cy, trackR, GAUGE_TRACK_START, scoreToAngle(displayScore))}
              fill="none"
              stroke={tier.hex}
              strokeWidth={size * 0.055}
              strokeLinecap="round"
              opacity={1}
              style={{
                filter: `drop-shadow(0 0 4px ${tier.hex}66)`,
              }}
            />
          )}

          {/* Needle base circle */}
          <circle
            cx={cx}
            cy={cy}
            r={size * 0.045}
            fill="#1A2236"
            stroke={tier.hex}
            strokeWidth={2}
          />

          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke="white"
            strokeWidth={size * 0.015}
            strokeLinecap="round"
            opacity={0.9}
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              transition: animate ? 'none' : undefined,
            }}
          />

          {/* Needle center dot */}
          <circle cx={cx} cy={cy} r={size * 0.022} fill="white" opacity={0.9} />

          {/* Min / Max labels */}
          {showLabel && (
            <>
              <text
                x={cx - outerR + 8}
                y={cy + outerR * 0.85}
                fill="rgba(255,255,255,0.3)"
                fontSize={size * 0.055}
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontWeight="600"
              >
                300
              </text>
              <text
                x={cx + outerR - 8}
                y={cy + outerR * 0.85}
                fill="rgba(255,255,255,0.3)"
                fontSize={size * 0.055}
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontWeight="600"
              >
                850
              </text>
            </>
          )}
        </svg>

        {/* Center score display */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ paddingTop: size * 0.1 }}
        >
          <div
            className="text-5xl font-black tabular tracking-tight"
            style={{
              color: tier.hex,
              fontSize: size * 0.22,
              textShadow: `0 0 20px ${tier.hex}44`,
            }}
          >
            {displayScore}
          </div>
          <div
            className="text-xs font-bold uppercase tracking-widest mt-1"
            style={{
              color: tier.hex,
              opacity: 0.8,
              fontSize: size * 0.052,
            }}
          >
            {tier.label}
          </div>
        </div>
      </div>
    </div>
  )
}
