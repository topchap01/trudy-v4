import { useState, useEffect, useCallback } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'

const STATIC_COMMANDS = [
  { id: 'nav-dashboard', label: 'Go to Dashboard', group: 'Navigation', action: 'navigate', path: '/dashboard' },
  { id: 'nav-new', label: 'New Campaign', group: 'Navigation', action: 'navigate', path: '/campaigns/new' },
  { id: 'nav-spark', label: 'Open Spark', group: 'Navigation', action: 'navigate', path: '/spark' },
  { id: 'nav-builder', label: 'Open Promo Builder', group: 'Navigation', action: 'navigate', path: '/promo-builder' },
]

/**
 * Command palette (Cmd+K / Ctrl+K).
 * Pass warRoomActions for contextual phase commands when in War Room.
 */
export default function CommandPalette({ warRoomActions }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  // Cmd+K / Ctrl+K to toggle
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const runCommand = useCallback(
    (cmd) => {
      setOpen(false)
      if (cmd.action === 'navigate') {
        navigate(cmd.path)
      } else if (cmd.action === 'callback' && typeof cmd.callback === 'function') {
        cmd.callback()
      }
    },
    [navigate]
  )

  // Merge static + war room contextual commands
  const warCmds = (warRoomActions || []).map((a) => ({
    ...a,
    group: 'War Room',
    action: 'callback',
  }))
  const allCommands = [...STATIC_COMMANDS, ...warCmds]

  // Group commands
  const groups = {}
  for (const cmd of allCommands) {
    if (!groups[cmd.group]) groups[cmd.group] = []
    groups[cmd.group].push(cmd)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <Command
        className="relative w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-700 shadow-2xl overflow-hidden"
        label="Command palette"
      >
        <Command.Input
          placeholder="Type a command or search..."
          className="w-full border-b dark:border-gray-700 px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-400"
          autoFocus
        />
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-gray-500">
            No results found.
          </Command.Empty>
          {Object.entries(groups).map(([group, items]) => (
            <Command.Group key={group} heading={group} className="text-xs font-semibold text-gray-400 dark:text-gray-500 px-2 py-1.5">
              {items.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={cmd.label}
                  onSelect={() => runCommand(cmd)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer aria-selected:bg-sky-50 dark:aria-selected:bg-sky-900/30 aria-selected:text-sky-700 dark:aria-selected:text-sky-300"
                >
                  {cmd.icon && <span className="text-base">{cmd.icon}</span>}
                  {cmd.label}
                  {cmd.shortcut && (
                    <kbd className="ml-auto text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="border-t dark:border-gray-700 px-4 py-2 text-[11px] text-gray-400 flex gap-3">
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 rounded px-1">↵</kbd> select</span>
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 rounded px-1">esc</kbd> close</span>
        </div>
      </Command>
    </div>
  )
}
