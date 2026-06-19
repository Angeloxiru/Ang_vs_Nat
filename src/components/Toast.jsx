import { create } from 'zustand'

const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) =>
    set((s) => ({ toasts: [...s.toasts, { id: Math.random().toString(36).slice(2), ...toast }] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export function toast(message, type = 'success') {
  const { push, remove } = useToastStore.getState()
  const id = Math.random().toString(36).slice(2)
  push({ id, message, type })
  setTimeout(() => remove(id), 3500)
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`pointer-events-auto w-full max-w-sm cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.type === 'error' ? 'bg-rose-600' : t.type === 'info' ? 'bg-slate-700' : 'bg-emerald-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
