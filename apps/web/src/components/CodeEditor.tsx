import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import '../lib/monaco';
import { monaco } from '../lib/monaco';
import { isDark } from '../lib/theme';

export interface EditorDiagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}

interface Props {
  value: string;
  onChange?: (v: string) => void;
  language: string; // rust | cpp | java
  readOnly?: boolean;
  height?: string | number;
  diagnostics?: EditorDiagnostic[];
  highlightLines?: number[];
  onLineClick?: (line: number) => void;
  onRun?: () => void;
  minimal?: boolean;
}

const MONACO_LANG: Record<string, string> = { rust: 'rust', cpp: 'cpp', java: 'java' };

export default function CodeEditor({ value, onChange, language, readOnly, height = 360, diagnostics, highlightLines, onLineClick, onRun, minimal }: Props) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const decoRef = useRef<string[]>([]);
  const [theme, setTheme] = useState(isDark() ? 'codemori-dark' : 'codemori-light');
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const clickRef = useRef(onLineClick);
  clickRef.current = onLineClick;

  useEffect(() => {
    const h = (e: Event) => setTheme((e as CustomEvent).detail ? 'codemori-dark' : 'codemori-light');
    window.addEventListener('cm-theme', h);
    return () => window.removeEventListener('cm-theme', h);
  }, []);

  // Marqueurs d'erreurs du compilateur
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'codemori',
      (diagnostics ?? []).map((d) => ({
        startLineNumber: d.line,
        endLineNumber: d.line,
        startColumn: d.column,
        endColumn: model.getLineMaxColumn(Math.min(d.line, model.getLineCount())),
        message: d.message,
        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      })),
    );
  }, [diagnostics, value]);

  // Lignes surlignées (exercice « trouver l'erreur »)
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    decoRef.current = ed.deltaDecorations(
      decoRef.current,
      (highlightLines ?? []).map((l) => ({ range: new monaco.Range(l, 1, l, 1), options: { isWholeLine: true, className: 'bg-amber-300/30', glyphMarginClassName: 'bg-amber-400' } })),
    );
  }, [highlightLines]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
    editor.onMouseDown((e) => {
      if (clickRef.current && e.target.position) clickRef.current(e.target.position.lineNumber);
    });
  };

  return (
    <div className="monaco-cm overflow-hidden" style={{ height }}>
      <Editor
        value={value}
        onChange={(v) => onChange?.(v ?? '')}
        language={MONACO_LANG[language] ?? 'plaintext'}
        theme={theme}
        onMount={onMount}
        loading={<div className="p-4 text-sm text-ink-400">Chargement de l’éditeur…</div>}
        options={{
          readOnly,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 14,
          lineHeight: 22,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          autoIndent: 'full',
          formatOnPaste: false,
          renderLineHighlight: readOnly ? 'none' : 'line',
          lineNumbers: 'on',
          glyphMargin: !minimal,
          folding: !minimal,
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
          quickSuggestions: !readOnly,
          suggestOnTriggerCharacters: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
          contextmenu: !readOnly,
          domReadOnly: readOnly,
        }}
      />
    </div>
  );
}
