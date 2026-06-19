import { useMemo, useState } from 'react'
import { useStore, usePriceAt, currentPrice } from '../lib/store'
import { scenarioSummary, buildTimeSeries, validateTransaction } from '../lib/portfolio'
import { SCENARIO_META } from '../lib/initialData'
import { StatCard } from '../components/StatCard'
import { LineChart } from '../components/Charts'
import { toast } from '../components/Toast'
import { brl, fmtDate, todayISO } from '../lib/format'
import { differenceInCalendarDays, parseISO } from 'date-fns'

export default function Trader({ who }) {
  const store = useStore()
  const priceAt = usePriceAt()
  const config = useStore((s) => s.config)
  const profile = useStore((s) => s.profiles[who])
  const transactions = useStore((s) => s.transactions[who]) || []
  const meta = SCENARIO_META[who]
  const price = currentPrice(store)

  const [form, setForm] = useState({ date: todayISO(), type: 'buy', qty: '', price: '' })
  const orders = useStore((s) => s.orders[who]) || []
  const [order, setOrder] = useState({ type: 'buy', qty: '', target: '', condition: 'lte' })

  const data = { transactions: store.transactions, dividends: store.dividends }
  const summary = scenarioSummary(who, config, data, price, todayISO())
  const buffet = scenarioSummary('buffet', config, data, price, todayISO())

  const { labels, series } = useMemo(() => {
    const from = config.startDate
    const to = todayISO()
    const totalDays = Math.max(1, differenceInCalendarDays(parseISO(to), parseISO(from)))
    const step = Math.max(1, Math.ceil(totalDays / 120))
    const me = buildTimeSeries({ scenario: who, config, data, from, to, priceAt, step })
    const bf = buildTimeSeries({ scenario: 'buffet', config, data, from, to, priceAt, step })
    return {
      labels: me.map((p) => p.date),
      series: [
        { label: meta.label, color: meta.color, points: me.map((p) => ({ date: p.date, value: p.equity })) },
        { label: 'Buffet', color: SCENARIO_META.buffet.color, points: bf.map((p) => ({ date: p.date, value: p.equity })) }
      ]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, store.transactions, store.dividends, store.priceHistory, who])

  const submit = (e) => {
    e.preventDefault()
    const tx = { date: form.date, type: form.type, qty: Number(form.qty), price: Number(form.price) }
    const check = validateTransaction(who, config, data, tx)
    if (!check.ok) {
      toast(check.error, 'error')
      return
    }
    store.addTransaction(who, tx)
    toast(`${form.type === 'buy' ? 'Compra' : 'Venda'} registrada para ${meta.label}.`)
    setForm({ date: todayISO(), type: 'buy', qty: '', price: '' })
  }

  const submitOrder = (e) => {
    e.preventDefault()
    const qty = Number(order.qty)
    const target = Number(order.target)
    if (!(qty > 0)) return toast('Quantidade deve ser positiva.', 'error')
    if (!(target > 0)) return toast('Preço-alvo deve ser positivo.', 'error')
    store.addOrder(who, { ...order, qty, target })
    store.runPriceTargets(price) // pode já estar atingido pela cotação atual
    toast('Alvo cadastrado. Será executado quando a cotação atingir o preço.')
    setOrder({ type: order.type, qty: '', target: '', condition: order.condition })
  }

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))
  const sortedOrders = [...orders].sort((a, b) => {
    const rank = { pending: 0, filled: 1, canceled: 2 }
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    return a.target - b.target
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold text-white" style={{ background: meta.color }}>
          {profile?.photo ? <img src={profile.photo} alt="" className="h-12 w-12 rounded-full object-cover" /> : meta.label[0]}
        </span>
        <div>
          <h1 className="text-xl font-bold">Carteira de {profile?.name || meta.label}</h1>
          <p className="text-sm text-slate-400">{profile?.thesis}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard scenario={who} summary={summary} profile={profile} />
        <StatCard scenario="buffet" summary={buffet} />
      </div>

      {/* Formulário */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Registrar operação</h2>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="buy">Compra</option>
              <option value="sell">Venda</option>
            </select>
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={form.date} min={config.startDate} max={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Quantidade</label>
            <input type="number" min="1" step="1" className="input" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="label">Preço unit. (R$)</label>
            <input type="number" min="0" step="0.01" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0,00" />
          </div>
          <button type="submit" className="btn-primary col-span-2 sm:col-span-1">Registrar</button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Total estimado:{' '}
          {brl((Number(form.qty) || 0) * (Number(form.price) || 0))} · Caixa disponível hoje: {brl(summary.cash)}
        </p>
      </section>

      {/* Alvos de preço */}
      <section className="card">
        <h2 className="mb-1 font-semibold">🎯 Alvos de preço (execução automática)</h2>
        <p className="mb-3 text-xs text-slate-400">
          Defina faixas de compra/venda. Quando a cotação atingir o alvo, o sistema executa a
          quantidade <b>ao preço-alvo</b> automaticamente (na atualização da cotação). Cotação atual:{' '}
          {brl(price)}.
        </p>
        <form onSubmit={submitOrder} className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
          <div>
            <label className="label">Tipo</label>
            <select
              className="input"
              value={order.type}
              onChange={(e) =>
                setOrder({ ...order, type: e.target.value, condition: e.target.value === 'buy' ? 'lte' : 'gte' })
              }
            >
              <option value="buy">Compra</option>
              <option value="sell">Venda</option>
            </select>
          </div>
          <div>
            <label className="label">Gatilho</label>
            <select className="input" value={order.condition} onChange={(e) => setOrder({ ...order, condition: e.target.value })}>
              <option value="lte">Quando cair até (≤)</option>
              <option value="gte">Quando subir até (≥)</option>
            </select>
          </div>
          <div>
            <label className="label">Quantidade</label>
            <input type="number" min="1" step="1" className="input" value={order.qty} onChange={(e) => setOrder({ ...order, qty: e.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="label">Preço-alvo (R$)</label>
            <input type="number" min="0" step="0.01" className="input" value={order.target} onChange={(e) => setOrder({ ...order, target: e.target.value })} placeholder="0,00" />
          </div>
          <button type="submit" className="btn-primary col-span-2 sm:col-span-1">Adicionar alvo</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Tipo</th>
                <th>Gatilho</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Alvo</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={`py-2 ${o.type === 'buy' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {o.type === 'buy' ? 'Compra' : 'Venda'}
                  </td>
                  <td className="text-xs text-slate-400">{o.condition === 'lte' ? '≤' : '≥'} alvo</td>
                  <td className="text-right">{o.qty}</td>
                  <td className="text-right">{brl(o.target)}</td>
                  <td>
                    {o.status === 'pending' && <span className="text-amber-500">⏳ pendente</span>}
                    {o.status === 'filled' && (
                      <span className="text-emerald-500">✅ executado{o.filledPrice ? ` @ ${brl(o.filledPrice)}` : ''}</span>
                    )}
                    {o.status === 'canceled' && <span className="text-slate-400">cancelado</span>}
                  </td>
                  <td className="text-right">
                    {o.status === 'pending' && (
                      <button className="text-rose-500 hover:underline" onClick={() => store.cancelOrder(who, o.id)}>
                        cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sortedOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-slate-400">Nenhum alvo cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Gráfico */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Patrimônio vs Buffet</h2>
        <LineChart series={series} labels={labels} mode="value" />
      </section>

      {/* Lista */}
      <section className="card">
        <h2 className="mb-1 font-semibold">Histórico de {meta.label}</h2>
        <p className="mb-3 text-xs text-slate-400">
          🔒 As operações registradas são permanentes e não podem ser excluídas por aqui. Toda
          movimentação fica gravada no registro de auditoria. Em caso de erro, fale com o
          administrador.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Data</th>
                <th>Tipo</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Preço</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{fmtDate(t.date)}</td>
                  <td className={t.type === 'buy' ? 'text-emerald-500' : 'text-rose-500'}>
                    {t.type === 'buy' ? 'Compra' : 'Venda'}
                    {t.auto && <span title="Executada por alvo de preço"> ⚡</span>}
                  </td>
                  <td className="text-right">{t.qty}</td>
                  <td className="text-right">{brl(t.price)}</td>
                  <td className="text-right">{brl(t.qty * t.price)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    Nenhuma operação registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
