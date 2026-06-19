import { useMemo, useState } from 'react'
import { useStore, usePriceAt, currentPrice } from '../lib/store'
import { scenarioSummary, buildTimeSeries } from '../lib/portfolio'
import { SCENARIOS, SCENARIO_META } from '../lib/initialData'
import { fetchCurrentQuote, fetchHistory } from '../lib/quote'
import { StatCard } from '../components/StatCard'
import { LineChart } from '../components/Charts'
import { toast } from '../components/Toast'
import { brl, fmtDate, todayISO } from '../lib/format'
import { differenceInCalendarDays, parseISO } from 'date-fns'

const PERIODS = [
  { key: 'all', label: 'Tudo' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: 'ytd', label: 'Ano' }
]

export default function Demo() {
  const store = useStore()
  const priceAt = usePriceAt()
  const config = useStore((s) => s.config)
  const profiles = useStore((s) => s.profiles)
  const quote = useStore((s) => s.quote)
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(config.startDate)
  const [to, setTo] = useState(todayISO())

  const data = { transactions: store.transactions, dividends: store.dividends }
  const price = currentPrice(store)

  const applyPeriod = (key) => {
    const today = todayISO()
    setTo(today)
    if (key === 'all') setFrom(config.startDate)
    else if (key === 'ytd') setFrom(`${today.slice(0, 4)}-01-01`)
    else {
      const d = new Date()
      d.setDate(d.getDate() - Number(key))
      setFrom(d.toISOString().slice(0, 10))
    }
  }

  const summaries = useMemo(
    () => SCENARIOS.map((sc) => scenarioSummary(sc, config, data, price, to)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, store.transactions, store.dividends, price, to]
  )
  const ranking = [...summaries].sort((a, b) => b.equity - a.equity)
  const rankOf = (sc) => ranking.findIndex((r) => r.scenario === sc) + 1

  // séries temporais
  const { labels, equitySeries, pctSeries } = useMemo(() => {
    const totalDays = Math.max(1, differenceInCalendarDays(parseISO(to), parseISO(from)))
    const step = Math.max(1, Math.ceil(totalDays / 120)) // ~120 pontos máx
    const perScenario = SCENARIOS.map((sc) => ({
      sc,
      points: buildTimeSeries({ scenario: sc, config, data, from, to, priceAt, step })
    }))
    const lbls = perScenario[0].points.map((p) => p.date)
    return {
      labels: lbls,
      equitySeries: perScenario.map(({ sc, points }) => ({
        label: SCENARIO_META[sc].label,
        color: SCENARIO_META[sc].color,
        points: points.map((p) => ({ date: p.date, value: p.equity }))
      })),
      pctSeries: perScenario.map(({ sc, points }) => ({
        label: SCENARIO_META[sc].label,
        color: SCENARIO_META[sc].color,
        points: points.map((p) => ({ date: p.date, value: p.profitability }))
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, store.transactions, store.dividends, store.priceHistory, from, to])

  const allTransactions = useMemo(() => {
    const rows = []
    for (const sc of ['nat', 'ang']) {
      for (const t of store.transactions[sc] || []) rows.push({ ...t, who: sc })
    }
    return rows
      .filter((t) => t.date >= from && t.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.transactions, from, to])

  const updateQuote = async () => {
    setLoading(true)
    try {
      const q = await fetchCurrentQuote(config.ticker)
      store.setQuote(q)
      try {
        const hist = await fetchHistory(config.ticker, config.startDate)
        if (hist.length) store.mergePriceHistory(hist)
      } catch {
        /* histórico é opcional */
      }
      toast(`Cotação atualizada: ${brl(q.price)}`)
    } catch {
      toast('Falha ao buscar cotação online. Use o preço manual no Admin.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const leader = ranking[0]

  return (
    <div className="space-y-5">
      {/* Cotação + ranking */}
      <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs text-slate-400">Cotação atual de {config.ticker}</div>
          <div className="text-2xl font-bold">{brl(price)}</div>
          <div className="text-xs text-slate-400">
            {quote?.updatedAt
              ? `Atualizado em ${new Date(quote.updatedAt).toLocaleString('pt-BR')}`
              : 'Usando preço inicial (sem cotação online ainda)'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-indigo-600/10 px-4 py-2 text-sm font-semibold text-indigo-500">
            🏆 Liderança: {SCENARIO_META[leader.scenario].label}
          </div>
          <button className="btn-primary" onClick={updateQuote} disabled={loading}>
            {loading ? 'Atualizando…' : '🔄 Atualizar'}
          </button>
        </div>
      </section>

      {/* Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCENARIOS.map((sc) => (
          <StatCard
            key={sc}
            scenario={sc}
            summary={summaries.find((s) => s.scenario === sc)}
            profile={profiles[sc]}
            rank={rankOf(sc)}
          />
        ))}
      </section>

      {/* Filtros */}
      <section className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">De</label>
          <input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Até</label>
          <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p.key} className="btn-ghost !px-3 !py-2" onClick={() => applyPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Gráficos */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Evolução do patrimônio</h2>
        <LineChart series={equitySeries} labels={labels} mode="value" />
      </section>
      <section className="card">
        <h2 className="mb-3 font-semibold">Rentabilidade acumulada</h2>
        <LineChart series={pctSeries} labels={labels} mode="pct" />
      </section>

      {/* Histórico */}
      <section className="card">
        <h2 className="mb-3 font-semibold">Histórico de transações</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Data</th>
                <th>Quem</th>
                <th>Tipo</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Preço</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {allTransactions.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{fmtDate(t.date)}</td>
                  <td>
                    <span style={{ color: SCENARIO_META[t.who].color }} className="font-medium">
                      {SCENARIO_META[t.who].label}
                    </span>
                  </td>
                  <td className={t.type === 'buy' ? 'text-emerald-500' : 'text-rose-500'}>
                    {t.type === 'buy' ? 'Compra' : 'Venda'}
                  </td>
                  <td className="text-right">{t.qty}</td>
                  <td className="text-right">{brl(t.price)}</td>
                  <td className="text-right">{brl(t.qty * t.price)}</td>
                </tr>
              ))}
              {allTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400">
                    Nenhuma transação no período.
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
