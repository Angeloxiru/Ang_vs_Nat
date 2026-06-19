import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { initialState } from './initialData'

const uid = () => Math.random().toString(36).slice(2, 10)

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
      addTransaction: (who, tx) =>
        set((s) => ({
          transactions: {
            ...s.transactions,
            [who]: [...(s.transactions[who] || []), { id: uid(), ...tx }]
          }
        })),
      updateTransaction: (who, id, patch) =>
        set((s) => ({
          transactions: {
            ...s.transactions,
            [who]: (s.transactions[who] || []).map((t) => (t.id === id ? { ...t, ...patch } : t))
          }
        })),
      removeTransaction: (who, id) =>
        set((s) => ({
          transactions: {
            ...s.transactions,
            [who]: (s.transactions[who] || []).filter((t) => t.id !== id)
          }
        })),

      // ---- Proventos ----
      addDividend: (dv) => set((s) => ({ dividends: [...s.dividends, { id: uid(), ...dv }] })),
      removeDividend: (id) => set((s) => ({ dividends: s.dividends.filter((d) => d.id !== id) })),

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
            priceHistory: s.priceHistory
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
          priceHistory: data.priceHistory || s.priceHistory
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
