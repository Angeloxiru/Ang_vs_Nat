// =====================================================================
// Robô de execução de alvos de preço (GitHub Actions, em dias úteis).
// Fluxo: busca cotação (Yahoo) -> carrega estado da planilha -> executa
// alvos atingidos (mesma lógica do app) -> grava de volta na planilha.
// Roda no servidor (sem CORS), então acessa o Yahoo diretamente.
//
// Configuração (Settings > Secrets and variables > Actions):
//   - SHEET_SECRET: o mesmo SECRET do Code.gs (se você definiu)
//   - SHEET_URL (opcional): sobrescreve a URL do src/syncConfig.js
// =====================================================================
import { executeOrders } from '../src/lib/orders.js'
import { syncConfig } from '../src/syncConfig.js'

const URL_ = process.env.SHEET_URL || syncConfig.url
const SECRET_ = process.env.SHEET_SECRET || syncConfig.secret || ''

async function fetchPrice(ticker) {
  const t = (ticker || 'ISAE4').toUpperCase()
  const sym = t.endsWith('.SA') ? t : `${t}.SA`
  for (const host of ['query1', 'query2']) {
    try {
      const res = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!res.ok) continue
      const j = await res.json()
      const meta = j?.chart?.result?.[0]?.meta
      const price = meta?.regularMarketPrice
      if (price != null) return Number(price)
    } catch {
      /* tenta o próximo host */
    }
  }
  throw new Error('Cotação indisponível no Yahoo')
}

async function loadState() {
  const res = await fetch(`${URL_}?action=load&secret=${encodeURIComponent(SECRET_)}`, { redirect: 'follow' })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error || 'falha ao carregar')
  return j.state
}

async function saveState(state) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: SECRET_, state }),
    redirect: 'follow'
  })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error || 'falha ao salvar')
  return j
}

async function main() {
  if (!URL_) {
    console.log('SHEET_URL não configurado (src/syncConfig.js vazio e sem secret). Nada a fazer.')
    return
  }
  const state = await loadState()
  if (!state || !state.config) {
    console.log('Planilha ainda sem dados. Nada a fazer.')
    return
  }
  const price = await fetchPrice(state.config.ticker)
  // data de hoje no fuso de São Paulo (BRT, UTC-3 fixo)
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const r = executeOrders(state, price, date)

  // mantém o histórico de preços atualizado (1 ponto por dia)
  const ph = [...(state.priceHistory || [])]
  const idx = ph.findIndex((p) => p.date === date)
  if (idx >= 0) ph[idx] = { date, price }
  else ph.push({ date, price })
  ph.sort((a, b) => a.date.localeCompare(b.date))

  const newState = {
    ...state,
    transactions: r.transactions,
    orders: r.orders,
    auditLog: r.auditLog,
    priceHistory: ph
  }
  await saveState(newState)

  console.log(`Cotação ${price} em ${date}. Ordens executadas: ${r.executed.length}`)
  r.executed.forEach((e) => console.log(`  - ${e.who}: ${e.type} ${e.qty} @ ${e.price}`))
}

main().catch((err) => {
  // Robô é best-effort: loga o erro mas não falha o workflow (evita ruído).
  console.error('Aviso:', err.message || err)
})
