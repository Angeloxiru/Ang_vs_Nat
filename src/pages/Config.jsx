import { useState } from 'react'
import { useStore, syncNow, hydrateFromRemote } from '../lib/store'
import { syncConfig, syncEnabled } from '../syncConfig'
import { pingRemote } from '../lib/remote'
import { SCENARIO_META } from '../lib/initialData'
import { toast } from '../components/Toast'
import { brl, fmtDate, fmtDateTime, todayISO } from '../lib/format'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function Gate({ onUnlock }) {
  const [pwd, setPwd] = useState('')
  const adminPassword = useStore((s) => s.config.adminPassword)
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card space-y-3 text-center">
        <div className="text-3xl">🔒</div>
        <h1 className="text-lg font-bold">Área de Configurações</h1>
        <p className="text-sm text-slate-400">Acesso restrito ao administrador.</p>
        <input
          type="password"
          className="input"
          placeholder="Senha"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
        />
        <button className="btn-primary w-full" onClick={check}>Entrar</button>
        <p className="text-xs text-slate-400">Senha padrão: <code>admin123</code> (altere abaixo após entrar).</p>
      </div>
    </div>
  )
  function check() {
    if (pwd === adminPassword) {
      sessionStorage.setItem('isae4-admin', '1')
      onUnlock()
    } else toast('Senha incorreta.', 'error')
  }
}

function Section({ title, children }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function ProfileEditor({ who }) {
  const profile = useStore((s) => s.profiles[who])
  const setProfile = useStore((s) => s.setProfile)
  const meta = SCENARIO_META[who]
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center gap-2 font-medium" style={{ color: meta.color }}>
        {meta.label}
      </div>
      <div className="flex items-center gap-3">
        {profile.photo ? (
          <img src={profile.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: meta.color }}>
            {meta.label[0]}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="text-xs"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) {
              const b64 = await fileToBase64(f)
              setProfile(who, { photo: b64 })
              toast('Foto atualizada.')
            }
          }}
        />
        {profile.photo && (
          <button className="text-xs text-rose-500" onClick={() => setProfile(who, { photo: '' })}>
            remover
          </button>
        )}
      </div>
      <div>
        <label className="label">Nome</label>
        <input className="input" value={profile.name} onChange={(e) => setProfile(who, { name: e.target.value })} />
      </div>
      <div>
        <label className="label">Descrição pessoal</label>
        <textarea className="input" rows={2} value={profile.description} onChange={(e) => setProfile(who, { description: e.target.value })} />
      </div>
      <div>
        <label className="label">Tese sobre o ativo</label>
        <textarea className="input" rows={2} value={profile.thesis} onChange={(e) => setProfile(who, { thesis: e.target.value })} />
      </div>
    </div>
  )
}

export default function Config() {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem('isae4-admin') === '1')
  const store = useStore()
  const config = useStore((s) => s.config)
  const dividends = useStore((s) => s.dividends)
  const priceHistory = useStore((s) => s.priceHistory)
  const transactions = useStore((s) => s.transactions)
  const auditLog = useStore((s) => s.auditLog)
  const sync = useStore((s) => s.sync)

  const [dv, setDv] = useState({ date: todayISO(), type: 'dividendo', value: '' })
  const [manual, setManual] = useState({ date: todayISO(), price: '' })

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />

  const saveDividend = () => {
    if (!dv.date || !(Number(dv.value) > 0)) return toast('Informe data e valor por ação.', 'error')
    store.addDividend({ date: dv.date, type: dv.type, value: Number(dv.value) })
    toast('Provento cadastrado — creditado nos 3 cenários conforme ações na data.')
    setDv({ date: todayISO(), type: 'dividendo', value: '' })
  }

  const doExport = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `isae4-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file) => {
    try {
      const text = await file.text()
      store.importData(text)
      toast('Dados importados com sucesso.')
    } catch {
      toast('Arquivo inválido.', 'error')
    }
  }

  const exportAuditCSV = () => {
    const header = ['data_hora', 'autor', 'acao', 'cenario', 'tipo', 'detalhe']
    const describe = (e) => {
      if (e.kind === 'transaction') {
        const d = e.action === 'edit' ? e.data.before : e.data
        return d ? `${d.type === 'buy' ? 'compra' : 'venda'} ${d.qty} @ R$ ${d.price}` : ''
      }
      if (e.kind === 'dividend') return `${e.data.type} R$ ${e.data.value}/ação em ${e.data.date}`
      return ''
    }
    const rows = [...auditLog]
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .map((e) => [fmtDateTime(e.ts), e.actor, e.action, e.scenario, e.kind, describe(e)])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `isae4-auditoria-${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const allTx = ['nat', 'ang']
    .flatMap((who) => (transactions[who] || []).map((t) => ({ ...t, who })))
    .sort((a, b) => b.date.localeCompare(a.date))

  const ACTION_LABEL = { add: 'Adição', remove: 'Exclusão', edit: 'Edição' }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">⚙️ Configurações</h1>

      <Section title="Parâmetros gerais">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Ticker</label>
            <input className="input" value={config.ticker} onChange={(e) => store.setConfig({ ticker: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="label">Capital inicial (R$)</label>
            <input type="number" className="input" value={config.initialCapital} onChange={(e) => store.setConfig({ initialCapital: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Taxa RF (% ao mês)</label>
            <input type="number" step="0.01" className="input" value={config.rfMonthlyRate * 100} onChange={(e) => store.setConfig({ rfMonthlyRate: Number(e.target.value) / 100 })} />
          </div>
          <div>
            <label className="label">Data inicial</label>
            <input type="date" className="input" value={config.startDate} onChange={(e) => store.setConfig({ startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Preço inicial (Buffet)</label>
            <input type="number" step="0.01" className="input" value={config.initialPrice} onChange={(e) => store.setConfig({ initialPrice: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Senha do admin</label>
            <input className="input" value={config.adminPassword} onChange={(e) => store.setConfig({ adminPassword: e.target.value })} />
          </div>
        </div>
      </Section>

      <Section title="Perfis">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProfileEditor who="nat" />
          <ProfileEditor who="ang" />
        </div>
      </Section>

      <Section title="Proventos (Dividendos / JCP)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={dv.type} onChange={(e) => setDv({ ...dv, type: e.target.value })}>
              <option value="dividendo">Dividendo</option>
              <option value="jcp">JCP</option>
            </select>
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={dv.date} onChange={(e) => setDv({ ...dv, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Valor por ação (R$)</label>
            <input type="number" step="0.0001" className="input" value={dv.value} onChange={(e) => setDv({ ...dv, value: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={saveDividend}>Cadastrar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr><th className="py-2">Data</th><th>Tipo</th><th className="text-right">R$/ação</th><th></th></tr>
            </thead>
            <tbody>
              {[...dividends].sort((a, b) => b.date.localeCompare(a.date)).map((d) => (
                <tr key={d.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{fmtDate(d.date)}</td>
                  <td className="uppercase">{d.type}</td>
                  <td className="text-right">{brl(d.value)}</td>
                  <td className="text-right">
                    <button className="text-rose-500 hover:underline" onClick={() => { store.removeDividend(d.id); toast('Provento removido.', 'info') }}>excluir</button>
                  </td>
                </tr>
              ))}
              {dividends.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-slate-400">Nenhum provento.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Histórico de cotações (manual)">
        <p className="text-xs text-slate-400">Use caso a API falhe. Preços informados aqui têm prioridade na data correspondente.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Preço (R$)</label>
            <input type="number" step="0.01" className="input" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={() => {
            if (!(Number(manual.price) > 0)) return toast('Informe um preço válido.', 'error')
            store.setManualPrice(manual.date, Number(manual.price))
            toast('Preço salvo.')
            setManual({ date: todayISO(), price: '' })
          }}>Salvar preço</button>
        </div>
        <div className="max-h-48 overflow-y-auto text-sm">
          {[...priceHistory].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60).map((p) => (
            <div key={p.date} className="flex items-center justify-between border-t border-slate-100 py-1 dark:border-slate-800">
              <span>{fmtDate(p.date)}</span>
              <span>{brl(p.price)}</span>
              <button className="text-rose-500" onClick={() => store.removePrice(p.date)}>×</button>
            </div>
          ))}
          {priceHistory.length === 0 && <p className="py-3 text-center text-slate-400">Sem histórico de preços.</p>}
        </div>
      </Section>

      <Section title="Gerenciar movimentações (admin)">
        <p className="text-xs text-slate-400">
          Os jogadores não podem excluir operações. Use esta área apenas para corrigir erros — toda
          exclusão é registrada na auditoria.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Data</th>
                <th>Jogador</th>
                <th>Tipo</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Preço</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allTx.map((t) => (
                <tr key={t.who + t.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{fmtDate(t.date)}</td>
                  <td style={{ color: SCENARIO_META[t.who].color }} className="font-medium">
                    {SCENARIO_META[t.who].label}
                  </td>
                  <td className={t.type === 'buy' ? 'text-emerald-500' : 'text-rose-500'}>
                    {t.type === 'buy' ? 'Compra' : 'Venda'}
                  </td>
                  <td className="text-right">{t.qty}</td>
                  <td className="text-right">{brl(t.price)}</td>
                  <td className="text-right">
                    <button
                      className="text-rose-500 hover:underline"
                      onClick={() => {
                        if (confirm(`Excluir ${t.type === 'buy' ? 'compra' : 'venda'} de ${t.qty} de ${SCENARIO_META[t.who].label}? A ação será registrada na auditoria.`)) {
                          store.removeTransaction(t.who, t.id, 'admin')
                          toast('Movimentação excluída (registrada na auditoria).', 'info')
                        }
                      }}
                    >
                      excluir
                    </button>
                  </td>
                </tr>
              ))}
              {allTx.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-slate-400">Nenhuma movimentação.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Registro de auditoria (${auditLog.length})`}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Histórico imutável de todas as adições e exclusões, para conferência futura.
          </p>
          <button className="btn-ghost !py-1.5" onClick={exportAuditCSV} disabled={!auditLog.length}>
            ⬇️ CSV
          </button>
        </div>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase text-slate-400 dark:bg-slate-900">
              <tr>
                <th className="py-2">Quando</th>
                <th>Autor</th>
                <th>Ação</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {[...auditLog].sort((a, b) => b.ts.localeCompare(a.ts)).map((e) => {
                const d = e.action === 'edit' ? e.data.before : e.data
                const detail =
                  e.kind === 'transaction'
                    ? `${d?.type === 'buy' ? 'Compra' : 'Venda'} de ${d?.qty} @ ${brl(d?.price)} (${fmtDate(d?.date)})`
                    : `${(e.data.type || '').toUpperCase()} ${brl(e.data.value)}/ação em ${fmtDate(e.data.date)}`
                return (
                  <tr key={e.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2 whitespace-nowrap">{fmtDateTime(e.ts)}</td>
                    <td className="font-medium" style={{ color: SCENARIO_META[e.actor]?.color }}>
                      {SCENARIO_META[e.actor]?.label || e.actor}
                    </td>
                    <td>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          e.action === 'remove'
                            ? 'bg-rose-500/15 text-rose-500'
                            : e.action === 'edit'
                              ? 'bg-amber-500/15 text-amber-500'
                              : 'bg-emerald-500/15 text-emerald-500'
                        }`}
                      >
                        {ACTION_LABEL[e.action]}
                      </span>
                    </td>
                    <td>{detail}</td>
                  </tr>
                )
              })}
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-slate-400">Sem registros ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Sincronização (Google Sheets)">
        {syncEnabled() ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    sync.status === 'ok'
                      ? 'bg-emerald-500'
                      : sync.status === 'syncing'
                        ? 'bg-amber-400'
                        : sync.status === 'error'
                          ? 'bg-rose-500'
                          : 'bg-slate-400'
                  }`}
                />
                {sync.status === 'ok'
                  ? 'Conectado'
                  : sync.status === 'syncing'
                    ? 'Sincronizando…'
                    : sync.status === 'error'
                      ? 'Erro'
                      : 'Pronto'}
              </span>
              {sync.lastSync && (
                <span className="text-xs text-slate-400">
                  Último: {fmtDateTime(sync.lastSync)}
                </span>
              )}
            </div>
            {sync.error && <p className="text-xs text-rose-500">{sync.error}</p>}
            <p className="break-all text-xs text-slate-400">Endpoint: {syncConfig.url}</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn-ghost" onClick={() => hydrateFromRemote()}>
                ⬇️ Puxar da planilha
              </button>
              <button className="btn-primary" onClick={() => syncNow()}>
                ⬆️ Enviar para planilha
              </button>
              <button
                className="btn-ghost"
                onClick={async () => {
                  try {
                    await pingRemote()
                    toast('Conexão OK com o backend.')
                  } catch (e) {
                    toast('Falha na conexão: ' + (e.message || e), 'error')
                  }
                }}
              >
                🔌 Testar conexão
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Sync desativado (modo offline / localStorage). Para ativar, crie o Web App em{' '}
            <code>google-apps-script/Code.gs</code> e preencha <code>src/syncConfig.js</code>. Veja o
            README.
          </p>
        )}
      </Section>

      <Section title="Backup de dados">
        <div className="flex flex-wrap gap-3">
          <button className="btn-ghost" onClick={doExport}>⬇️ Exportar JSON</button>
          <label className="btn-ghost cursor-pointer">
            ⬆️ Importar JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          </label>
          <button className="btn-danger" onClick={() => { if (confirm('Restaurar dados iniciais? Isso apaga tudo.')) { store.resetData(); toast('Dados restaurados.', 'info') } }}>
            ♻️ Restaurar padrão
          </button>
        </div>
      </Section>
    </div>
  )
}
