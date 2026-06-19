import { useEffect, useState } from 'react'

const DISMISS_KEY = 'isae4-install-dismissed'

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)

// Banner que sugere instalar como PWA no celular.
// - Android/Chrome: usa o evento beforeinstallprompt (botão "Instalar").
// - iOS/Safari: mostra instrução manual (não há API de prompt).
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)

  useEffect(() => {
    if (isStandalone() || !isMobile() || localStorage.getItem(DISMISS_KEY)) return

    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // iOS não dispara beforeinstallprompt — sugere o passo manual.
    if (isIOS()) setShow(true)

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  const install = async () => {
    if (isIOS()) {
      setIosHelp(true)
      return
    }
    if (deferred) {
      deferred.prompt()
      const choice = await deferred.userChoice.catch(() => null)
      setDeferred(null)
      if (choice?.outcome === 'accepted') setShow(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-4 sm:bottom-4">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">📲</span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Instale o app na tela inicial</p>
            {iosHelp ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                No Safari: toque em <b>Compartilhar</b> (ícone ⬆️) e depois em{' '}
                <b>Adicionar à Tela de Início</b>.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Acesso rápido, em tela cheia e funciona offline.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button className="btn-primary !py-1.5 text-xs" onClick={install}>
                {isIOS() ? 'Como instalar' : 'Instalar'}
              </button>
              <button className="btn-ghost !py-1.5 text-xs" onClick={dismiss}>
                Agora não
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
