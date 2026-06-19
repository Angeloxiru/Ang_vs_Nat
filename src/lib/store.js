import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { initialState } from './initialData'

const uid = () => Math.random().toString(36).slice(2, 10)

const auditEntry = (actor, action, scenario, kind, data) => ({
  id: uid(),
  ts: new Date().toISOString(),
  actor,
  action,
  scenario,
  kind,
  data
})

// Constrói um mapa ordenado de preços a partir do histórico para lookup rápido.
function sortedHistory(history) {
  return [...(history || [])].sort((a, b) => a.date.localeCompare(b.date))
}

export const useStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      // ---- Configurações gerais ----
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

      // ---- Perfis ----
      setProfile: (who, patch) =>
        set((s) => ({ profiles: { ...s.profiles, [who]: { ...s.profiles[who], ...patch } } })),

      // ---- Transações (impactam apenas o cenário informado) ----
      // Toda adição/edição/exclusão é registrada no auditLog para conferência.
      addTransaction: (who, tx) =>
        set((s) => {
          const record = { id: uid(), ...tx }
          return {
            transactions: { ...s.transactions, [who]: [...(s.transactions[who] || []), record] },
            auditLog: [...s.auditLog, auditEntry(who, 'add', who, 'transaction', record)]
          }
        }),
      updateTransaction: (who, id, patch, actor = 'admin') =>
        set((s) => {
          const before = (s.transactions[who] || []).find((t) => t.id === id)
          return {
            transactions: {
              ...s.transactions,
              [who]: (s.transactions[who] || []).map((t) => (t.id === id ? { ...t, ...patch } : t))
            },
            auditLog: [...s.auditLog, auditEntry(actor, 'edit', who, 'transaction', { before, patch })]
          }
        }),
      // Exclusão é uma ação administrativa (jogadores não excluem).
      removeTransaction: (who, id, actor = 'admin') =>
        set((s) => {
          const removed = (s.transactions[who] || []).find((t) => t.id === id)
          return {
            transactions: {
              ...s.transactions,
              [who]: (s.transactions[who] || []).filter((t) => t.id !== id)
            },
            auditLog: removed
              ? [...s.auditLog, auditEntry(actor, 'remove', who, 'transaction', removed)]
              : s.auditLog
          }
        }),

      // ---- Proventos ----
      addDividend: (dv) =>
        set((s) => {
          const record = { id: uid(), ...dv }
          return {
            dividends: [...s.dividends, record],
            auditLog: [...s.auditLog, auditEntry('admin', 'add', 'todos', 'dividend', record)]
          }
        }),
      removeDividend: (id) =>
        set((s) => {
          const removed = s.dividends.find((d) => d.id === id)
          return {
            dividends: s.dividends.filter((d) => d.id !== id),
            auditLog: removed
              ? [...s.auditLog, auditEntry('admin', 'remove', 'todos', 'dividend', removed)]
              : s.auditLog
          }
        }),

      // ---- Cotação / histórico de preços ----
      setQuote: (quote) => set(() => ({ quote: { ...quote, updatedAt: new Date().toISOString() } })),
      mergePriceHistory: (entries) =>
        set((s) => {
          const map = new Map((s.priceHistory || []).map((p) => [p.date, p.price]))
          for (const e of entries) map.set(e.date, e.price)
          return { priceHistory: sortedHistory([...map].map(([date, price]) => ({ date, price }))) }
        }),
      setManualPrice: (date, price) =>
        set((s) => {
          const map = new Map((s.priceHistory || []).map((p) => [p.date, p.price]))
          map.set(date, Number(price))
          return { priceHistory: sortedHistory([...map].map(([d, p]) => ({ date: d, price: p }))) }
        }),
      removePrice: (date) =>
        set((s) => ({ priceHistory: (s.priceHistory || []).filter((p) => p.date !== date) })),

      // ---- Tema ----
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      // ---- Export / Import ----
      exportData: () => {
        const s = get()
        return JSON.stringify(
          {
            config: s.config,
            profiles: s.profiles,
            transactions: s.transactions,
            dividends: s.dividends,
            priceHistory: s.priceHistory,
            auditLog: s.auditLog
          },
          null,
          2
        )
      },
      importData: (json) => {
        const data = typeof json === 'string' ? JSON.parse(json) : json
        set((s) => ({
          config: { ...s.config, ...(data.config || {}) },
          profiles: { ...s.profiles, ...(data.profiles || {}) },
          transactions: { ...s.transactions, ...(data.transactions || {}) },
          dividends: data.dividends || s.dividends,
          priceHistory: data.priceHistory || s.priceHistory,
          auditLog: data.auditLog || s.auditLog
        }))
      },
      resetData: () => set(() => ({ ...initialState }))
    }),
    {
      name: 'isae4-app',
      version: 1,
      partialize: (s) => ({
        config: s.config,
        profiles: s.profiles,
        transactions: s.transactions,
        dividends: s.dividends,
        quote: s.quote,
        priceHistory: s.priceHistory,
        auditLog: s.auditLog,
        theme: s.theme
      })
    }
  )
)

// Retorna uma função priceAt(isoDate) -> preço, com carry-forward do último
// preço conhecido e fallbacks (cotação atual / preço inicial).
export function usePriceAt() {
  const history = useStore((s) => s.priceHistory)
  const quote = useStore((s) => s.quote)
  const initialPrice = useStore((s) => s.config.initialPrice)
  const sorted = sortedHistory(history)

  return (iso) => {
    let price = null
    for (const p of sorted) {
      if (p.date <= iso) price = p.price
      else break
    }
    if (price == null && sorted.length > 0) price = sorted[0].price // antes do 1º ponto
    if (price == null) price = quote?.price ?? initialPrice
    return price
  }
}

export function currentPrice(state) {
  return state.quote?.price ?? state.config.initialPrice
}
