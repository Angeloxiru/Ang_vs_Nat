// =====================================================================
// Lógica pura de execução de alvos de preço (ordens limitadas).
// Compartilhada entre o app (store.runPriceTargets) e o robô do GitHub
// Actions (scripts/run-orders.mjs) — uma única fonte da regra.
//
// Regra: compra dispara quando preço <= alvo; venda quando preço >= alvo
// (condition 'lte'/'gte'). Executa AO PREÇO-ALVO e só se houver caixa/ações
// suficientes; senão a ordem permanece pendente. Impacta só o próprio cenário.
// =====================================================================
import { validateTransaction } from './portfolio.js'

const uid = () => Math.random().toString(36).slice(2, 10)

export function executeOrders(state, price, date, nowISO = new Date().toISOString()) {
  const p = Number(price)
  const result = {
    transactions: {
      nat: [...((state.transactions && state.transactions.nat) || [])],
      ang: [...((state.transactions && state.transactions.ang) || [])]
    },
    orders: {
      nat: [...((state.orders && state.orders.nat) || [])],
      ang: [...((state.orders && state.orders.ang) || [])]
    },
    auditLog: [...(state.auditLog || [])],
    executed: []
  }
  if (!p) return result
  const dividends = state.dividends || []

  for (const who of ['nat', 'ang']) {
    const pending = result.orders[who].filter((o) => o.status === 'pending')
    for (const o of pending) {
      const hit = o.condition === 'lte' ? p <= o.target : p >= o.target
      if (!hit) continue
      const tx = { date, type: o.type, qty: o.qty, price: o.target }
      const data = { transactions: result.transactions, dividends }
      const check = validateTransaction(who, state.config, data, tx)
      if (!check.ok) continue // sem caixa/ações: segue pendente p/ próxima cotação
      const record = { id: uid(), ...tx, auto: true, orderId: o.id }
      result.transactions[who] = [...result.transactions[who], record]
      result.orders[who] = result.orders[who].map((x) =>
        x.id === o.id ? { ...x, status: 'filled', filledAt: nowISO, filledPrice: o.target } : x
      )
      result.auditLog = [
        ...result.auditLog,
        { id: uid(), ts: nowISO, actor: who, action: 'add', scenario: who, kind: 'transaction', data: record }
      ]
      result.executed.push({ who, ...record })
    }
  }
  return result
}
