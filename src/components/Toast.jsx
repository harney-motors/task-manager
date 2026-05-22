import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2)
    const type = opts.type ?? 'info'
    const duration = opts.duration ?? (type === 'error' ? 5000 : 3000)
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4 max-w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded-full text-white text-xs font-medium shadow-lg pointer-events-auto max-w-full truncate ${
              t.type === 'error' ? 'bg-danger-text' : 'bg-text'
            }`}
          >
            {t.msg}
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
