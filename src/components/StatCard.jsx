import { brl, pct, num } from '../lib/format'
import { SCENARIO_META } from '../lib/initialData'

export function StatCard({ scenario, summary, profile, rank }) {
  const meta = SCENARIO_META[scenario]
  const positive = summary.profitability >= 0
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {profile?.photo ? (
            <img src={profile.photo} alt={meta.label} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white"
              style={{ background: meta.color }}
            >
              {meta.label[0]}
            </span>
          )}
          <div>
            <div className="font-semibold leading-tight">{profile?.name || meta.label}</div>
            <div className="text-xs text-slate-400">{scenario === 'buffet' ? 'Buy & Hold' : 'Ativo'}</div>
          </div>
        </div>
        {rank != null && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold dark:bg-slate-800">
            #{rank}
          </span>
        )}
      </div>

      <div>
        <div className="text-2xl font-bold tracking-tight">{brl(summary.equity)}</div>
        <div className={`text-sm font-semibold ${positive ? 'text-emerald-500' : 'text-rose-500'}`}>
          {pct(summary.profitability)}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex justify-between">
          <dt>Ações</dt>
          <dd className="font-medium text-slate-700 dark:text-slate-200">{num(summary.shares)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Caixa RF</dt>
          <dd className="font-medium text-slate-700 dark:text-slate-200">{brl(summary.cash)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Mercado</dt>
          <dd className="font-medium text-slate-700 dark:text-slate-200">{brl(summary.marketValue)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Proventos</dt>
          <dd className="font-medium text-slate-700 dark:text-slate-200">{brl(summary.dividendsReceived)}</dd>
        </div>
      </dl>
    </div>
  )
}
