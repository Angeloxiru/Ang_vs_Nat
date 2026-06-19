import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { initialState } from './initialData'
import { loadRemote, saveRemote } from './remote'
import { syncEnabled } from '../syncConfig'
import { validateTransaction } from './portfolio'
import { todayISO } from './format'

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

      // Estado de sincronização (não persistido)
      sync: { status: syncEnabled() ? 'idle' : 'off', lastSync: null, error: null },
      setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),

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

      // ---- Alvos de preço (ordens automáticas) ----
      addOrder: (who, order) =>
        set((s) => {
          const record = {
            id: uid(),
            type: order.type,
            qty: Number(order.qty),
            target: Number(order.target),
            condition: order.condition || (order.type === 'buy' ? 'lte' : 'gte'),
            createdAt: new Date().toISOString(),
            status: 'pending'
          }
          return {
            orders: { ...s.orders, [who]: [...(s.orders[who] || []), record] },
            auditLog: [...s.auditLog, auditEntry(who, 'add', who, 'order', record)]
          }
        }),
      cancelOrder: (who, id) =>
        set((s) => {
          const o = (s.orders[who] || []).find((x) => x.id === id)
          if (!o || o.status !== 'pending') return {}
          return {
            orders: {
              ...s.orders,
              [who]: s.orders[who].map((x) => (x.id === id ? { ...x, status: 'canceled' } : x))
            },
            auditLog: [...s.auditLog, auditEntry(who, 'remove', who, 'order', o)]
          }
        }),
      // Avalia as ordens pendentes contra um preço e executa as atingidas.
      // Executa ao preço-alvo e só se houver caixa/ações suficientes (senão
      // permanece pendente para nova tentativa). Impacta só o próprio cenário.
      runPriceTargets: (price) => {
        const p = Number(price)
        if (!p) return
        const date = todayISO()
        ;['nat', 'ang'].forEach((who) => {
          const pending = (get().orders[who] || []).filter((o) => o.status === 'pending')
          for (const o of pending) {
            const hit = o.condition === 'lte' ? p <= o.target : p >= o.target
            if (!hit) continue
            const tx = { date, type: o.type, qty: o.qty, price: o.target }
            const data = { transactions: get().transactions, dividends: get().dividends }
            const check = validateTransaction(who, get().config, data, tx)
            if (!check.ok) continue // sem caixa/ações: tenta de novo no próximo preço
            get().addTransaction(who, { ...tx, auto: true, orderId: o.id })
            set((st) => ({
              orders: {
                ...st.orders,
                [who]: st.orders[who].map((x) =>
                  x.id === o.id
                    ? { ...x, status: 'filled', filledAt: new Date().toISOString(), filledPrice: o.target }
                    : x
                )
              }
            }))
          }
        })
      },

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
            orders: s.orders,
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
          orders: { ...s.orders, ...(data.orders || {}) },
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
        orders: s.orders,
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

// =====================================================================
// Sincronização com o backend (Google Sheets). Quando configurado:
//  - hydrateFromRemote(): carrega o estado da planilha ao abrir o app.
//  - autosave: a cada alteração nos dados, envia o estado (debounce).
// O guard `hydrating` evita eco (a hidratação não dispara novo save).
// =====================================================================
let hydrating = false
let saveTimer = null

async function pushRemote() {
  const s = useStore.getState()
  if (!syncEnabled()) return
  s.setSync({ status: 'syncing', error: null })
  try {
    const payload = JSON.parse(s.exportData())
    await saveRemote(payload)
    s.setSync({ status: 'ok', lastSync: new Date().toISOString(), error: null })
  } catch (e) {
    s.setSync({ status: 'error', error: String(e.message || e) })
  }
}

export async function hydrateFromRemote() {
  if (!syncEnabled()) return
  const s = useStore.getState()
  s.setSync({ status: 'syncing', error: null })
  hydrating = true
  try {
    const remote = await loadRemote()
    if (remote && remote.config) s.importData(remote)
    s.setSync({ status: 'ok', lastSync: new Date().toISOString(), error: null })
  } catch (e) {
    s.setSync({ status: 'error', error: String(e.message || e) })
  } finally {
    setTimeout(() => {
      hydrating = false
      // Após carregar o estado, avalia alvos contra o último preço conhecido.
      const st = useStore.getState()
      st.runPriceTargets(currentPrice(st))
    }, 450)
  }
}

export function syncNow() {
  return pushRemote()
}

// Auto-save: observa as fatias de dados e envia ao remoto com debounce.
const DATA_KEYS = ['config', 'profiles', 'transactions', 'dividends', 'orders', 'priceHistory', 'auditLog']
useStore.subscribe((state, prev) => {
  if (!syncEnabled() || hydrating) return
  const changed = DATA_KEYS.some((k) => state[k] !== prev[k])
  if (!changed) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(pushRemote, 1200)
})
