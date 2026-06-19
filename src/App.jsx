import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useStore, hydrateFromRemote } from './lib/store'
import Layout from './components/Layout'
import Demo from './pages/Demo'
import Trader from './pages/Trader'
import Config from './pages/Config'
import { Toaster } from './components/Toast'
import InstallPrompt from './components/InstallPrompt'
import UpdateBanner from './components/UpdateBanner'
import { ensureLatestVersion } from './lib/updates'

// Compatibilidade com ?user=nat|ang|admin (redireciona para a rota de hash).
function QueryRedirect() {
  const [params] = useSearchParams()
  const user = params.get('user')
  const map = { nat: '/nat', ang: '/ang', admin: '/config', demo: '/' }
  if (user && map[user]) return <Navigate to={map[user]} replace />
  return <Navigate to="/" replace />
}

export default function App() {
  const theme = useStore((s) => s.theme)
  const [updateVersion, setUpdateVersion] = useState(null)

  // Checa a versão publicada no GitHub Pages na entrada e ao focar a aba.
  useEffect(() => {
    ensureLatestVersion(setUpdateVersion)
    const onFocus = () => ensureLatestVersion(setUpdateVersion)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  // Carrega o estado compartilhado da planilha (se o sync estiver configurado).
  useEffect(() => {
    hydrateFromRemote()
    // Re-sincroniza ao voltar o foco para a aba.
    const onFocus = () => hydrateFromRemote()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Demo />} />
          <Route path="/nat" element={<Trader who="nat" />} />
          <Route path="/ang" element={<Trader who="ang" />} />
          <Route path="/config" element={<Config />} />
          <Route path="/u" element={<QueryRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <UpdateBanner version={updateVersion} onClose={() => setUpdateVersion(null)} />
      <InstallPrompt />
      <Toaster />
    </>
  )
}
