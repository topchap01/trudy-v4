import { useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'

/**
 * JSON editor with syntax highlighting, replacing raw textarea.
 * Props:
 *   value: string — JSON text
 *   onChange: (value: string) => void
 *   readOnly?: boolean
 *   height?: string (default '300px')
 *   error?: string — validation error to show below
 */
export default function JsonEditor({ value, onChange, readOnly = false, height = '300px', error }) {
  const handleChange = useCallback(
    (val) => onChange?.(val),
    [onChange]
  )

  return (
    <div className="space-y-1">
      <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
        <CodeMirror
          value={value}
          onChange={handleChange}
          extensions={[json()]}
          height={height}
          readOnly={readOnly}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            indentOnInput: true,
            highlightActiveLine: !readOnly,
          }}
          theme="light"
          className="text-sm"
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
      )}
    </div>
  )
}
