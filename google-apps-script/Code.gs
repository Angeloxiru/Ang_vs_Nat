/**
 * ISAE4 Competição — Backend em Google Sheets (Apps Script Web App)
 * =================================================================
 *
 * Este script transforma uma Planilha Google em "banco de dados" do app.
 * Ele expõe um Web App com:
 *   - GET  ?action=load&secret=XXX            -> retorna o estado completo (JSON)
 *   - POST { secret, state }                  -> grava o estado e atualiza as abas
 *
 * COMO INSTALAR
 * -------------
 * 1. Crie uma Planilha Google nova (ela será o banco).
 * 2. Menu: Extensões > Apps Script. Apague o conteúdo e cole ESTE arquivo.
 * 3. (Opcional, recomendado) Defina um segredo em SECRET abaixo. Use o MESMO
 *    valor em src/syncConfig.js do app.
 * 4. Implantar > Nova implantação > Tipo "App da Web".
 *      - Executar como: Eu mesmo
 *      - Quem tem acesso: Qualquer pessoa
 *    Copie a URL do app da Web (termina em /exec).
 * 5. Cole essa URL (e o segredo) em src/syncConfig.js, faça commit e redeploy.
 *
 * Observação de segurança: a URL é pública. O segredo reduz abuso, mas qualquer
 * pessoa com a URL + segredo pode escrever. Mantenha-os restritos ao seu grupo.
 */

// >>> Defina um segredo compartilhado (use o mesmo em src/syncConfig.js).
// Deixe '' para desativar a checagem (não recomendado).
const SECRET = ''

const DATA_SHEET = 'Dados'
const AUDIT_SHEET = 'Auditoria'
const TX_SHEET = 'Transacoes'
const DV_SHEET = 'Proventos'

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sh = ss.getSheetByName(name)
  if (!sh) {
    sh = ss.insertSheet(name)
    if (headers) sh.appendRow(headers)
  }
  return sh
}

function readState_() {
  const sh = sheet_(DATA_SHEET)
  const val = sh.getRange('A1').getValue()
  if (!val) return null
  try {
    return JSON.parse(val)
  } catch (e) {
    return null
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  )
}

function checkSecret_(provided) {
  if (!SECRET) return true
  return provided === SECRET
}

function doGet(e) {
  const params = (e && e.parameter) || {}
  if (!checkSecret_(params.secret)) return json_({ ok: false, error: 'unauthorized' })
  if (params.action === 'load') {
    return json_({ ok: true, state: readState_() })
  }
  return json_({ ok: true, status: 'online' })
}

function doPost(e) {
  let body = {}
  try {
    body = JSON.parse(e.postData.contents)
  } catch (err) {
    return json_({ ok: false, error: 'invalid json' })
  }
  if (!checkSecret_(body.secret)) return json_({ ok: false, error: 'unauthorized' })

  const state = body.state || {}
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    // 1) Estado completo (fonte da verdade do app)
    sheet_(DATA_SHEET).getRange('A1').setValue(JSON.stringify(state))

    // 2) Abas legíveis para conferência (reescritas a cada save)
    writeTransactions_(state)
    writeDividends_(state)

    // 3) Auditoria append-only (acrescenta só entradas novas, por id)
    appendAudit_(state.auditLog || [])

    return json_({ ok: true, savedAt: new Date().toISOString() })
  } finally {
    lock.releaseLock()
  }
}

function writeTransactions_(state) {
  const sh = sheet_(TX_SHEET)
  sh.clear()
  sh.appendRow(['id', 'jogador', 'data', 'tipo', 'quantidade', 'preco', 'total'])
  const tx = (state.transactions || {})
  const rows = []
  ;['nat', 'ang'].forEach(function (who) {
    ;(tx[who] || []).forEach(function (t) {
      rows.push([t.id, who, t.date, t.type === 'buy' ? 'compra' : 'venda', t.qty, t.price, (t.qty || 0) * (t.price || 0)])
    })
  })
  rows.sort(function (a, b) {
    return String(a[2]).localeCompare(String(b[2]))
  })
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows)
}

function writeDividends_(state) {
  const sh = sheet_(DV_SHEET)
  sh.clear()
  sh.appendRow(['id', 'data', 'tipo', 'valor_por_acao'])
  const rows = (state.dividends || []).map(function (d) {
    return [d.id, d.date, d.type, d.value]
  })
  rows.sort(function (a, b) {
    return String(a[1]).localeCompare(String(b[1]))
  })
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows)
}

function appendAudit_(auditLog) {
  const sh = sheet_(AUDIT_SHEET, ['id', 'quando', 'autor', 'acao', 'cenario', 'tipo', 'detalhe'])
  // ids já registrados (coluna A)
  const last = sh.getLastRow()
  const seen = {}
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1)
      .getValues()
      .forEach(function (r) {
        seen[r[0]] = true
      })
  }
  const novos = auditLog
    .filter(function (en) {
      return en && en.id && !seen[en.id]
    })
    .map(function (en) {
      return [en.id, en.ts, en.actor, en.action, en.scenario, en.kind, describe_(en)]
    })
  if (novos.length) sh.getRange(sh.getLastRow() + 1, 1, novos.length, novos[0].length).setValues(novos)
}

function describe_(en) {
  if (en.kind === 'transaction') {
    var d = en.action === 'edit' ? (en.data && en.data.before) : en.data
    if (!d) return ''
    return (d.type === 'buy' ? 'compra' : 'venda') + ' ' + d.qty + ' @ R$ ' + d.price + ' (' + d.date + ')'
  }
  if (en.kind === 'dividend') {
    return (en.data.type || '') + ' R$ ' + en.data.value + '/ação em ' + en.data.date
  }
  if (en.kind === 'order') {
    return 'alvo ' + (en.data.type === 'buy' ? 'compra' : 'venda') + ' ' + en.data.qty + ' @ R$ ' + en.data.target + ' (' + en.data.condition + ')'
  }
  return ''
}

// =====================================================================
// EXECUÇÃO AUTOMÁTICA DOS ALVOS (gatilho de tempo do Apps Script)
// ---------------------------------------------------------------------
// Configure um acionador de TEMPO chamando a função runPriceTargets:
//   Editor do Apps Script > Acionadores (relógio) > Adicionar acionador
//   - Função: runPriceTargets
//   - Origem do evento: Baseado no tempo
//   - Tipo: Timer de minutos > A cada 15 minutos
// A própria função só age em dias úteis, das 10h às 17h (BRT).
// =====================================================================

var RF_BASE_DAYS = 30

function parseISO_(s) {
  var p = String(s).slice(0, 10).split('-')
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])))
}
function daysBetween_(a, b) {
  return Math.max(0, Math.round((parseISO_(b) - parseISO_(a)) / 86400000))
}
function rfFactor_(from, to, monthly) {
  var days = daysBetween_(from, to)
  if (!days || !monthly) return 1
  return Math.pow(1 + monthly, days / RF_BASE_DAYS)
}

// Caixa e ações de um cenário ativo (nat/ang) numa data — espelha portfolio.js.
function activeStateAt_(targetDate, config, transactions, dividends) {
  var cash = Number(config.initialCapital) || 0
  var shares = 0
  var last = config.startDate
  var events = []
  ;(transactions || []).forEach(function (t) {
    events.push({ date: t.date, kind: t.type === 'sell' ? 'sell' : 'buy', qty: Number(t.qty) || 0, price: Number(t.price) || 0 })
  })
  ;(dividends || []).forEach(function (d) {
    events.push({ date: d.date, kind: 'dividend', value: Number(d.value) || 0 })
  })
  events.sort(function (a, b) {
    var da = parseISO_(a.date) - parseISO_(b.date)
    if (da !== 0) return da
    var o = { buy: 0, sell: 0, dividend: 1 }
    return o[a.kind] - o[b.kind]
  })
  var target = parseISO_(targetDate)
  for (var i = 0; i < events.length; i++) {
    var ev = events[i]
    if (parseISO_(ev.date) > target) break
    cash *= rfFactor_(last, ev.date, config.rfMonthlyRate)
    last = ev.date
    if (ev.kind === 'buy') {
      cash -= ev.qty * ev.price
      shares += ev.qty
    } else if (ev.kind === 'sell') {
      cash += ev.qty * ev.price
      shares -= ev.qty
    } else {
      cash += shares * ev.value
    }
  }
  cash *= rfFactor_(last, targetDate, config.rfMonthlyRate)
  return { cash: cash, shares: shares }
}

function uid_() {
  return Math.random().toString(36).slice(2, 10)
}

// Mesma regra do app (src/lib/orders.js): executa ao preço-alvo se houver
// caixa/ações; senão a ordem segue pendente. Impacta só o próprio cenário.
function executeOrders_(state, price, date) {
  var now = new Date().toISOString()
  var result = {
    transactions: {
      nat: ((state.transactions && state.transactions.nat) || []).slice(),
      ang: ((state.transactions && state.transactions.ang) || []).slice()
    },
    orders: {
      nat: ((state.orders && state.orders.nat) || []).slice(),
      ang: ((state.orders && state.orders.ang) || []).slice()
    },
    auditLog: (state.auditLog || []).slice(),
    executed: []
  }
  var p = Number(price)
  if (!p) return result
  var dividends = state.dividends || []
  ;['nat', 'ang'].forEach(function (who) {
    var pending = result.orders[who].filter(function (o) {
      return o.status === 'pending'
    })
    pending.forEach(function (o) {
      var hit = o.condition === 'lte' ? p <= o.target : p >= o.target
      if (!hit) return
      var st = activeStateAt_(date, state.config, result.transactions[who], dividends)
      if (o.type === 'sell' && o.qty > st.shares + 1e-9) return
      if (o.type === 'buy' && o.qty * o.target > st.cash + 1e-6) return
      var record = { id: uid_(), date: date, type: o.type, qty: o.qty, price: o.target, auto: true, orderId: o.id }
      result.transactions[who].push(record)
      result.orders[who] = result.orders[who].map(function (x) {
        return x.id === o.id ? Object.assign({}, x, { status: 'filled', filledAt: now, filledPrice: o.target }) : x
      })
      result.auditLog.push({ id: uid_(), ts: now, actor: who, action: 'add', scenario: who, kind: 'transaction', data: record })
      result.executed.push(Object.assign({ who: who }, record))
    })
  })
  return result
}

function fetchPrice_(ticker) {
  var t = String(ticker || 'ISAE4').toUpperCase()
  var sym = t.indexOf('.SA') >= 0 ? t : t + '.SA'
  var hosts = ['query1', 'query2']
  for (var i = 0; i < hosts.length; i++) {
    try {
      var res = UrlFetchApp.fetch(
        'https://' + hosts[i] + '.finance.yahoo.com/v8/finance/chart/' + sym + '?range=1d&interval=1d',
        { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (res.getResponseCode() !== 200) continue
      var j = JSON.parse(res.getContentText())
      var r = j && j.chart && j.chart.result && j.chart.result[0]
      var meta = r && r.meta
      if (meta && meta.regularMarketPrice != null) return Number(meta.regularMarketPrice)
    } catch (e) {
      /* tenta o próximo host */
    }
  }
  throw new Error('Cotação indisponível no Yahoo')
}

// Função do acionador de tempo. Roda só em dias úteis, 10h-17h (BRT).
function runPriceTargets() {
  var TZ = 'America/Sao_Paulo'
  // Evita o padrão 'u' do formatDate (derruba o runtime V8). Calcula o dia da
  // semana a partir do Y-M-D no fuso de São Paulo via getUTCDay (0=dom..6=sáb).
  var ymd = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')
  var hour = Number(Utilities.formatDate(new Date(), TZ, 'HH')) // 0-23
  var parts = ymd.split('-')
  var dow = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))).getUTCDay()
  if (dow === 0 || dow === 6 || hour < 10 || hour > 17) return // fora do pregão

  var lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    var state = readState_()
    if (!state || !state.config) return
    var price = fetchPrice_(state.config.ticker)
    var date = ymd
    var r = executeOrders_(state, price, date)

    // histórico de preços: 1 ponto por dia
    var ph = (state.priceHistory || []).slice()
    var found = false
    for (var i = 0; i < ph.length; i++) {
      if (ph[i].date === date) {
        ph[i] = { date: date, price: price }
        found = true
        break
      }
    }
    if (!found) ph.push({ date: date, price: price })
    ph.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    })

    var newState = Object.assign({}, state, {
      transactions: r.transactions,
      orders: r.orders,
      auditLog: r.auditLog,
      priceHistory: ph
    })
    sheet_(DATA_SHEET).getRange('A1').setValue(JSON.stringify(newState))
    writeTransactions_(newState)
    writeDividends_(newState)
    appendAudit_(newState.auditLog || [])

    Logger.log('Cotação ' + price + ' em ' + date + '. Executadas: ' + r.executed.length)
  } finally {
    lock.releaseLock()
  }
}
