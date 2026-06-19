import { NavLink, Outlet, Link } from 'react-router-dom'
import { useStore } from '../lib/store'

const links = [
  { to: '/', label: 'Demonstração', icon: '📊', end: true },
  { to: '/nat', label: 'Nat', icon: '🌸' },
  { to: '/ang', label: 'Ang', icon: '🌊' },
  { to: '/config', label: 'Config', icon: '⚙️' }
]

function NavItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-xs font-medium transition sm:flex-none sm:flex-row sm:gap-2 sm:text-sm ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function Layout() {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const ticker = useStore((s) => s.config.ticker)

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col">
      {/* Top bar (desktop) */}
      <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:flex">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">I4</span>
          <span>
            {ticker} <span className="text-slate-400">Competição</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => (
            <NavItem key={l.to} {...l} />
          ))}
          <button onClick={toggleTheme} className="btn-ghost ml-2 !px-3" title="Alternar tema">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </nav>
      </header>

      {/* Mobile header */}
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:hidden">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">I4</span>
          {ticker}
        </Link>
        <button onClick={toggleTheme} className="btn-ghost !px-3" title="Alternar tema">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      <main className="flex-1 px-4 py-5 pb-24 sm:pb-8">
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-slate-200 bg-white/90 px-2 py-1.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:hidden">
        {links.map((l) => (
          <NavItem key={l.to} {...l} />
        ))}
      </nav>
    </div>
  )
}
