import { useTour } from '../lib/useTour'

// Visual layer for the tour engine. Renders three things on top of
// the live app:
//   1. A dimmed backdrop that mutes everything else
//   2. A "spotlight" hole punched around the current step's target
//      (skipped when the step has no target — used for intro / outro
//      pages that are just full-width text)
//   3. The popover with title, body, prev/next/finish buttons
//
// The spotlight is implemented as a single backdrop element with a
// CSS clip-path cutout, so we don't have to render four edge-rectangles
// to fake a hole. The popover positions itself near the target based
// on the step's `placement` hint, with a safe centred fallback.

const OVERLAY_OPACITY = 0.62
const SPOTLIGHT_PAD = 8 // px of breathing room around the target

export default function TourOverlay({ tour, open, onClose }) {
  const { step, target, index, total, isFirst, isLast, next, prev, finish } =
    useTour({ tour, open, onClose })

  if (!open || !step) return null

  const hasTarget = !!target && !!step.target

  // Spotlight: an SVG `mask` cuts out a rounded rectangle over the
  // target. Cheaper than CSS clip-path on Safari for the moving case.
  const spotlight = hasTarget
    ? {
        x: target.left - SPOTLIGHT_PAD,
        y: target.top - SPOTLIGHT_PAD,
        w: target.width + SPOTLIGHT_PAD * 2,
        h: target.height + SPOTLIGHT_PAD * 2,
      }
    : null

  // Popover positioning. If we have a target, anchor on the requested
  // side; otherwise centre on screen.
  const popoverStyle = computePopoverPosition(target, step.placement)

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Dimmed backdrop with spotlight cutout */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-auto"
        style={{ touchAction: 'none' }}
        onClick={(e) => {
          // Clicking outside the popover dismisses the tour.
          if (e.target === e.currentTarget) finish()
        }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.x}
                y={spotlight.y}
                width={spotlight.w}
                height={spotlight.h}
                rx="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 1)"
          fillOpacity={OVERLAY_OPACITY}
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Popover. Two render branches because the centered case (intro
          / outro steps with no target) can't rely on `transform:
          translate(-50%,-50%)` for centring — the tickd-popover
          entrance animation sets `transform: scale(1) translateY(0)`
          at its end keyframe, which overrides any inline transform.
          Using a flex container for the centred case sidesteps that
          conflict entirely; the targeted case sets explicit top/left
          and never relies on transform for positioning. */}
      {hasTarget ? (
        <div
          className="absolute pointer-events-auto bg-surface border border-border rounded-2xl shadow-2xl p-5 w-[min(360px,calc(100vw-32px))] tickd-popover"
          style={popoverStyle}
        >
          <PopoverContent
            step={step}
            index={index}
            total={total}
            isFirst={isFirst}
            isLast={isLast}
            onPrev={prev}
            onNext={next}
            onFinish={finish}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
          <div className="pointer-events-auto bg-surface border border-border rounded-2xl shadow-2xl p-5 w-[min(360px,calc(100vw-32px))] tickd-popover">
            <PopoverContent
              step={step}
              index={index}
              total={total}
              isFirst={isFirst}
              isLast={isLast}
              onPrev={prev}
              onNext={next}
              onFinish={finish}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function PopoverContent({
  step,
  index,
  total,
  isFirst,
  isLast,
  onPrev,
  onNext,
  onFinish,
}) {
  return (
    <>
      <div className="text-[10px] uppercase tracking-wider text-text-3 font-medium mb-1.5">
        Step {index + 1} of {total}
      </div>
      <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
      <p className="text-sm text-text-2 mt-2 leading-relaxed">{step.body}</p>
      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={onFinish}
          className="text-xs text-text-3 hover:text-text"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={onPrev}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-surface-2"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="text-xs px-3 py-1.5 rounded-md bg-info text-white font-medium hover:opacity-90"
          >
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}

// Position the popover relative to the target. Picks an edge based on
// the step's `placement` hint; falls back to centred when there's no
// target or no room on the preferred side.
function computePopoverPosition(target, placement) {
  const POPOVER_W = 360
  const POPOVER_H = 190 // approximate; just used for edge fitting
  const GAP = 14

  if (!target) {
    // Centred — used for intro / outro steps
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight

  const wantRight = placement === 'right'
  const wantLeft = placement === 'left'
  const wantTop = placement === 'top'
  // default: 'bottom'

  // Each candidate returns { top, left, ok } — ok is whether it fits.
  const candidates = []
  if (wantRight) {
    candidates.push({
      top: clamp(target.top, 16, vh - POPOVER_H - 16),
      left: target.right + GAP,
      ok: target.right + GAP + POPOVER_W < vw - 16,
    })
  }
  if (wantLeft) {
    candidates.push({
      top: clamp(target.top, 16, vh - POPOVER_H - 16),
      left: target.left - GAP - POPOVER_W,
      ok: target.left - GAP - POPOVER_W > 16,
    })
  }
  if (wantTop) {
    candidates.push({
      top: target.top - GAP - POPOVER_H,
      left: clamp(target.left, 16, vw - POPOVER_W - 16),
      ok: target.top - GAP - POPOVER_H > 16,
    })
  }
  // Bottom (default / fallback)
  candidates.push({
    top: target.bottom + GAP,
    left: clamp(target.left, 16, vw - POPOVER_W - 16),
    ok: target.bottom + GAP + POPOVER_H < vh - 16,
  })

  const pick = candidates.find((c) => c.ok) ?? candidates[candidates.length - 1]
  return { top: pick.top, left: pick.left }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
