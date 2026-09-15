import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastKind } from '../views/types'

export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const toastTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  )

  const pushToast = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastIdRef.current
    setToasts((list) => [...list.slice(-2), { id, kind, text }])
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(id)
      setToasts((list) => list.filter((t) => t.id !== id))
    }, 6000)
    toastTimersRef.current.set(id, timer)
  }, [])

  useEffect(() => {
    const timers = toastTimersRef.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  return { toasts, pushToast }
}
