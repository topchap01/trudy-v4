import { Link, useLocation } from "react-router-dom";
import { DarkModeToggle } from "./ui/dark-mode-toggle.jsx";

export default function TopNav() {
  const { pathname } = useLocation();

  const navLink = (to, label, highlight = false) => {
    const active = pathname === to || pathname.startsWith(to + '/');
    return (
      <Link
        to={to}
        className={`text-sm px-2 py-1 rounded-md transition-colors ${
          active
            ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 font-medium'
            : highlight
              ? 'text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="sticky top-0 z-10 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b dark:border-gray-800" aria-label="Main navigation">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-sky-600 text-white px-3 py-1 rounded">
        Skip to content
      </a>
      <div className="max-w-6xl mx-auto px-4 h-11 flex items-center gap-1">
        <Link to="/shelf" className="font-semibold tracking-tight text-gray-900 dark:text-gray-100 mr-3">Trudy</Link>
        {navLink('/shelf', 'The Shelf', true)}
        {navLink('/shelf/history', 'History')}
        {navLink('/dashboard', 'Campaigns')}
        <div className="flex-1" />
        <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5 font-mono mr-2">
          <span className="text-xs">&#8984;</span>K
        </kbd>
        <DarkModeToggle />
      </div>
    </nav>
  );
}
