'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { cls } from '@/lib/utils'

type ToastKind = 'info' | 'success' | 'error'
interface Toast { id: string; msg: string; kind: ToastKind }
interface ToastCtxValue { push: (msg: string, kind?: ToastKind) => void }

const ToastCtx = createContext<ToastCtxValue>({ push: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setItems(x => [...x, { id, msg, kind }])
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 3200)
  }, [])

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {items.map(i => (
          <div key={i.id} className={cls('toast', i.kind !== 'info' && `toast--${i.kind}`)}>
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() { return useContext(ToastCtx) }
