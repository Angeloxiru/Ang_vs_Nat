// Cliente do backend Google Sheets (Apps Script Web App).
// Usa Content-Type text/plain no POST para evitar preflight CORS
// (o Apps Script lê e.postData.contents como JSON).
import { syncConfig, syncEnabled } from '../syncConfig'

export async function loadRemote() {
  if (!syncEnabled()) return null
  const url = `${syncConfig.url}?action=load&secret=${encodeURIComponent(syncConfig.secret || '')}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'Falha ao carregar')
  return json.state // pode ser null se a planilha ainda estiver vazia
}

export async function saveRemote(state) {
  if (!syncEnabled()) return null
  const res = await fetch(syncConfig.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: syncConfig.secret || '', state }),
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'Falha ao salvar')
  return json
}

export async function pingRemote() {
  if (!syncEnabled()) throw new Error('Sync não configurado')
  const url = `${syncConfig.url}?secret=${encodeURIComponent(syncConfig.secret || '')}`
  const res = await fetch(url, { redirect: 'follow' })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'Sem resposta')
  return json
}
