import { useEffect, useState } from 'react'

// Tiny tour orchestration hook. A "tour" is an ordered list of steps;
// each step targets a DOM element (by CSS selector) and renders a
// popover with title/body/prev/next/finish. The hook owns the step
// index, the resolved target rect, and the dismissal state.
//
// Why hand-rolled instead of shepherd.js / driver.js / intro.js?
// Those libraries are 30–60 KB gzipped and bring their own styling
// system. The whole feature here is ~200 lines and uses the project's
// existing CSS variables (so dark mode + brand colour Just Work).
//
// A tour is "remembered" via localStorage so an autofire flag like
// "Welcome on first login" doesn't reopen on every page load.

const COMPLETED_KEY = 'tickd:tours-completed'

function readCompleted() {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}
function writeCompleted(set) {
  try {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(Array.from(set)))
  } catch {
    /* localStorage disabled — ignore */
  }
}

export function markTourCompleted(tourId) {
  const set = readCompleted()
  set.add(tourId)
  writeCompleted(set)
}
export function isTourCompleted(tourId) {
  return readCompleted().has(tourId)
}
export function resetTour(tourId) {
  const set = readCompleted()
  set.delete(tourId)
  writeCompleted(set)
}

// Public hook. `tour` is the definition (see lib/tours.js).
// `open` controls visibility — caller manages it (so the trigger
// button + auto-fire-on-first-login can both feed in).
//
// Returns: { step, target, next, prev, finish, isFirst, isLast }
//   step    — the current step object (or null when closed/done)
//   target  — DOMRect of the current step's target (or null if none)
//   next    — advance to next step (finishes if last)
//   prev    — back to previous step
//   finish  — close + mark complete
//
// Resizing the window or scrolling updates `target` so the popover
// follows. An `onClose` callback fires when the user dismisses or
// finishes — caller uses it to flip `open` back to false.
export function useTour({ tour, open, onClose }) {
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState(null)

  // Reset index whenever the tour opens / changes.
  useEffect(() => {
    if (open) setIndex(0)
  }, [open, tour?.id])

  const step = open && tour?.steps[index] ? tour.steps[index] : null

  // Compute the target rect when the step changes, and re-measure on
  // resize / scroll so the spotlight + popover follow.
  useEffect(() => {
    if (!step) {
      setTarget(null)
      return
    }
    function measure() {
      if (!step.target) {
        setTarget(null)
        return
      }
      const el = document.querySelector(step.target)
      if (!el) {
        setTarget(null)
        return
      }
      const rect = el.getBoundingClientRect()
      setTarget({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      })
      // Make sure the target is visible — scroll smoothly if it's off-screen.
      const offscreen =
        rect.top < 0 ||
        rect.bottom > window.innerHeight ||
        rect.left < 0 ||
        rect.right > window.innerWidth
      if (offscreen) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    measure()
    // Re-measure after the smooth scroll settles + on resize.
    const t = setTimeout(measure, 400)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step?.target])

  function next() {
    if (!tour) return
    if (index >= tour.steps.length - 1) {
      finish()
      return
    }
    setIndex((i) => i + 1)
  }
  function prev() {
    setIndex((i) => Math.max(0, i - 1))
  }
  function finish() {
    if (tour?.id) markTourCompleted(tour.id)
    onClose?.()
  }

  return {
    step,
    target,
    index,
    total: tour?.steps.length ?? 0,
    isFirst: index === 0,
    isLast: tour ? index >= tour.steps.length - 1 : false,
    next,
    prev,
    finish,
  }
}
