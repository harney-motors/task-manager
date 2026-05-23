import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Track per-toast dismissal timers so we can cancel them if the
  // user takes the toast's action (e.g. clicks Undo).
  const timersRef = useRef(new Map())

  function clearTimer(id) {
    const t = timersRef.current.get(id)
    if (t) {
      clearTimeout(t)
      timersRef.current.delete(id)
    }
  }

  const dismiss = useCallback((id) => {
    clearTimer(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // showToast accepts:
  //   msg: string
  //   opts: {
  //     type?: 'info' | 'error' | 'success',
  //     duration?: ms (defaults: error 5000, otherwise 3000; longer when an action is present)
  //     action?: { label: string, onClick: () => void }
  //   }
  // Returns an id that callers can pass to dismissToast() to close
  // programmatically.
  const showToast = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2)
    const type = opts.type ?? 'info'
    const action = opts.action ?? null
    // Action toasts get a longer default so the user has time to react.
    const defaultDuration = type === 'error' ? 5000 : action ? 6000 : 3000
    const duration = opts.duration ?? defaultDuration

    setToasts((prev) => [...prev, { id, msg, type, action }])
    const timer = setTimeout(() => dismiss(id), duration)
    timersRef.current.set(id, timer)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4 max-w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded-full text-white text-xs font-medium shadow-lg pointer-events-auto max-w-full flex items-center gap-3 ${
              t.type === 'error' ? 'bg-danger-text' : 'bg-text'
            }`}
          >
            <span className="truncate">{t.msg}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action.onClick()
                  dismiss(t.id)
                }}
                className="text-[11px] uppercase tracking-wider font-semibold underline opacity-90 hover:opacity-100 flex-shrink-0"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const fn = useContext(ToastContext)
  if (!fn) throw new Error('useToast must be used inside ToastProvider')
  return fn
}
