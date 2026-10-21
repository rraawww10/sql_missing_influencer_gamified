// CodeMirror 6 SQL editor. Ctrl/Cmd+Enter runs the query. Table and column names autocomplete.
import { useEffect, useRef } from 'react';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { sql, SQLite } from '@codemirror/lang-sql';

export interface SqlEditorHandle { insert(text: string): void; set(text: string): void; focus(): void }

interface Props {
  initial: string;
  schema: Record<string, string[]>;
  onChange(text: string): void;
  onRun(): void;
  handle?: (h: SqlEditorHandle) => void;
}

export function SqlEditor({ initial, schema, onChange, onRun, handle }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const run = useRef(onRun);
  run.current = onRun;
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          sql({ dialect: SQLite, schema, upperCaseKeywords: true }),
          keymap.of([{ key: 'Mod-Enter', run: () => { run.current(); return true; } }]),
          cmPlaceholder('Write your SQL here…'),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'SQL editor' }),
          EditorView.updateListener.of((u) => { if (u.docChanged) change.current(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    handle?.({
      insert: (text) => { v.dispatch(v.state.replaceSelection(text)); v.focus(); },
      set: (text) => { v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } }); v.focus(); },
      focus: () => v.focus(),
    });
    return () => v.destroy();
    // the editor is created once per task; schema/initial changes remount via `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor" ref={host} />;
}
