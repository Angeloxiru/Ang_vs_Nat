import { applyUpdate } from '../lib/updates'

// Mostrado apenas quando o auto-update não conseguiu aplicar sozinho
// (ex.: cache de CDN atrasado). Oferece o update por botão.
export default function UpdateBanner({ version, onClose }) {
  if (!version) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 px-4 pt-2">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-indigo-300 bg-indigo-600 p-3 text-white shadow-lg">
        <span>🔄</span>
        <p className="flex-1 text-sm font-medium">Nova versão disponível ({version}).</p>
        <button className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30" onClick={applyUpdate}>
          Atualizar
        </button>
        <button className="px-1 text-white/70" onClick={onClose} aria-label="fechar">
          ✕
        </button>
      </div>
    </div>
  )
}
