// =====================================================================
// Núcleo de cálculo dos portfólios (engine).
//
// Conceitos:
// - Nat e Ang começam com `initialCapital` em caixa (RF rendendo `rfMonthlyRate` ao mês).
// - Cada compra deduz do caixa e adiciona ações; cada venda faz o inverso.
// - O caixa não investido rende juros de RF, compostos proporcionalmente por dia.
// - Buffet ("buy & hold") compra TODO o capital inicial em ISAE4 na data inicial,
//   ao `initialPrice`, e nunca mais movimenta.
// - Proventos (Dividendos/JCP): na data do evento, cada cenário recebe
//   (ações_na_data * valorPorAcao) creditado no caixa.
//
// Patrimônio em uma data D = caixa (com RF acumulado até D) + ações * preço(D).
// =====================================================================

import { differenceInCalendarDays, parseISO } from 'date-fns'

const toDate = (d) => (typeof d === 'string' ? parseISO(d) : d)

// Fator de rendimento de RF entre duas datas, com 1%/mês composto e
// proporcional por dia (base 30 dias/mês).
function rfFactor(fromDate, toD, monthlyRate) {
  const days = Math.max(0, differenceInCalendarDays(toDate(toD), toDate(fromDate)))
  if (days === 0 || !monthlyRate) return 1
  return Math.pow(1 + monthlyRate, days / 30)
}

// Constrói a lista cronológica de eventos de um cenário.
// transactions: [{ id, date, type: 'buy'|'sell', qty, price }]
// dividends:    [{ id, date, type: 'dividendo'|'jcp', value }]  (value = R$/ação)
function buildEvents(transactions = [], dividends = []) {
  const tx = transactions.map((t) => ({
    date: t.date,
    kind: t.type === 'sell' ? 'sell' : 'buy',
    qty: Number(t.qty) || 0,
    price: Number(t.price) || 0
  }))
  const dv = dividends.map((d) => ({
    date: d.date,
    kind: 'dividend',
    value: Number(d.value) || 0
  }))
  return [...tx, ...dv].sort((a, b) => {
    const da = toDate(a.date).getTime()
    const db = toDate(b.date).getTime()
    if (da !== db) return da - db
    // numa mesma data: aplicar compras/vendas antes dos proventos
    const order = { buy: 0, sell: 0, dividend: 1 }
    return order[a.kind] - order[b.kind]
  })
}

// Estado (caixa, ações) de um cenário ATIVO (Nat/Ang) em uma data alvo.
export function activeStateAt(targetDate, { initialCapital, rfMonthlyRate, startDate }, transactions, dividends) {
  let cash = Number(initialCapital) || 0
  let shares = 0
  let dividendsReceived = 0
  let lastDate = startDate
  const target = toDate(targetDate)

  const events = buildEvents(transactions, dividends)
  for (const ev of events) {
    if (toDate(ev.date) > target) break
    // acumula RF até a data do evento
    cash *= rfFactor(lastDate, ev.date, rfMonthlyRate)
    lastDate = ev.date
    if (ev.kind === 'buy') {
      cash -= ev.qty * ev.price
      shares += ev.qty
    } else if (ev.kind === 'sell') {
      cash += ev.qty * ev.price
      shares -= ev.qty
    } else if (ev.kind === 'dividend') {
      const credit = shares * ev.value
      cash += credit
      dividendsReceived += credit
    }
  }
  // acumula RF do último evento até a data alvo
  cash *= rfFactor(lastDate, targetDate, rfMonthlyRate)
  return { cash, shares, dividendsReceived }
}

// Estado do cenário Buffet (buy & hold) numa data alvo.
// Compra fracionária do capital inteiro na data inicial ao initialPrice.
export function buffetStateAt(targetDate, { initialCapital, initialPrice, rfMonthlyRate, startDate }, dividends) {
  const price = Number(initialPrice) || 0
  let shares = price > 0 ? Number(initialCapital) / price : 0
  let cash = price > 0 ? 0 : Number(initialCapital) // se não há preço inicial, fica em caixa
  let dividendsReceived = 0
  let lastDate = startDate
  const target = toDate(targetDate)

  const dv = buildEvents([], dividends)
  for (const ev of dv) {
    if (toDate(ev.date) > target) break
    cash *= rfFactor(lastDate, ev.date, rfMonthlyRate)
    lastDate = ev.date
    const credit = shares * ev.value
    cash += credit
    dividendsReceived += credit
  }
  cash *= rfFactor(lastDate, targetDate, rfMonthlyRate)
  return { cash, shares, dividendsReceived }
}

// Patrimônio = caixa + ações * preço.
export function equity(state, price) {
  return state.cash + state.shares * (Number(price) || 0)
}

// Rentabilidade percentual sobre o capital inicial.
export function profitability(equityValue, initialCapital) {
  const base = Number(initialCapital) || 0
  if (base <= 0) return 0
  return (equityValue / base - 1) * 100
}

// Calcula um resumo completo de um cenário em uma data, dado um preço.
export function scenarioSummary(scenario, config, data, price, atDate) {
  const { initialCapital, rfMonthlyRate, startDate, initialPrice } = config
  const dividends = data.dividends || []
  let state
  if (scenario === 'buffet') {
    state = buffetStateAt(atDate, { initialCapital, initialPrice, rfMonthlyRate, startDate }, dividends)
  } else {
    const tx = (data.transactions && data.transactions[scenario]) || []
    state = activeStateAt(atDate, { initialCapital, rfMonthlyRate, startDate }, tx, dividends)
  }
  const eq = equity(state, price)
  return {
    scenario,
    cash: state.cash,
    shares: state.shares,
    dividendsReceived: state.dividendsReceived,
    marketValue: state.shares * (Number(price) || 0),
    equity: eq,
    profitability: profitability(eq, initialCapital)
  }
}

// Valida uma transação contra o estado atual (não vender mais do que possui,
// não comprar sem caixa suficiente). Retorna { ok, error }.
export function validateTransaction(scenario, config, data, newTx) {
  const qty = Number(newTx.qty)
  const price = Number(newTx.price)
  if (!newTx.date) return { ok: false, error: 'Informe a data.' }
  if (!(qty > 0)) return { ok: false, error: 'Quantidade deve ser positiva.' }
  if (!(price > 0)) return { ok: false, error: 'Preço deve ser positivo.' }
  if (toDate(newTx.date) < toDate(config.startDate))
    return { ok: false, error: 'Data anterior ao início da disputa.' }

  const tx = (data.transactions && data.transactions[scenario]) || []
  const state = activeStateAt(newTx.date, config, tx, data.dividends || [])
  if (newTx.type === 'sell' && qty > state.shares + 1e-9) {
    return { ok: false, error: `Saldo insuficiente: possui ${state.shares.toFixed(0)} ações nessa data.` }
  }
  if (newTx.type === 'buy' && qty * price > state.cash + 1e-6) {
    return { ok: false, error: `Caixa insuficiente: R$ ${state.cash.toFixed(2)} disponíveis nessa data.` }
  }
  return { ok: true }
}

// Gera uma série temporal de patrimônio/rentabilidade entre duas datas.
// priceAt: função (isoDate) => preço naquela data.
// step: intervalo em dias entre pontos.
export function buildTimeSeries({ scenario, config, data, from, to, priceAt, step = 1 }) {
  const start = toDate(from)
  const end = toDate(to)
  const points = []
  const totalDays = differenceInCalendarDays(end, start)
  for (let d = 0; d <= totalDays; d += step) {
    const date = new Date(start)
    date.setDate(start.getDate() + d)
    const iso = date.toISOString().slice(0, 10)
    const price = priceAt(iso)
    const summary = scenarioSummary(scenario, config, data, price, iso)
    points.push({
      date: iso,
      equity: summary.equity,
      profitability: summary.profitability
    })
  }
  // garante que o último ponto seja exatamente a data final
  const lastIso = end.toISOString().slice(0, 10)
  if (points.length === 0 || points[points.length - 1].date !== lastIso) {
    const price = priceAt(lastIso)
    const summary = scenarioSummary(scenario, config, data, price, lastIso)
    points.push({ date: lastIso, equity: summary.equity, profitability: summary.profitability })
  }
  return points
}
