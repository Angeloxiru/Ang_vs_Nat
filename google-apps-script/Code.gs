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
