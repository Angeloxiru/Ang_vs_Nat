// =====================================================================
// Verificação de versão e auto-update.
// Compara a versão embutida no bundle (gerada no build a partir do commit)
// com o version.json publicado no site (GitHub Pages). Se diferirem, há um
// deploy novo -> limpamos caches/SW e recarregamos para a versão correta.
// =====================================================================

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const RELOAD_FLAG = 'isae4-update-reload'

// Retorna a versão publicada se for diferente da que está rodando; senão null.
export async function getPublishedVersionIfNewer() {
  try {
    const res = await fetch(`./version.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.version && data.version !== APP_VERSION) return data.version
  } catch {
    /* offline ou indisponível: mantém versão atual */
  }
  return null
}

// Remove service workers e caches e recarrega — garante assets novos.
export async function applyUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})))
    }
    if (window.caches) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    window.location.reload()
  }
}

// Na entrada: se houver versão nova, atualiza automaticamente uma vez.
// Se após recarregar ainda divergir (ex.: cache de CDN atrasado), evita loop
// e chama onManual() para oferecer o update por botão.
export async function ensureLatestVersion(onManual) {
  const newer = await getPublishedVersionIfNewer()
  if (!newer) {
    sessionStorage.removeItem(RELOAD_FLAG)
    return
  }
  if (sessionStorage.getItem(RELOAD_FLAG) === newer) {
    // já tentamos recarregar para esta versão; não entrar em loop
    onManual?.(newer)
    return
  }
  sessionStorage.setItem(RELOAD_FLAG, newer)
  await applyUpdate()
}
