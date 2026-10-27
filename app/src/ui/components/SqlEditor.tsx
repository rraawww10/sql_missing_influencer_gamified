// CodeMirror 6 SQL editor. Ctrl/Cmd+Enter runs the query. Table and column names autocomplete.
import { useEffect, useMemo, useRef } from 'react';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { Compartment, EditorState, Prec } from '@codemirror/state';
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

// the schema arrives async and again after every run; only rebuild the language when it really differs
const signature = (schema: Record<string, string[]>) =>
  Object.keys(schema).sort().map((t) => `${t}(${schema[t].join(',')})`).join('|');

export function SqlEditor({ initial, schema, onChange, onRun, handle }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lang = useRef(new Compartment());
  const run = useRef(onRun);
  run.current = onRun;
  const change = useRef(onChange);
  change.current = onChange;
  const latest = useRef(schema);
  latest.current = schema;
  const sig = useMemo(() => signature(schema), [schema]);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          // before basicSetup: its defaultKeymap binds Mod-Enter to insertBlankLine, and in CodeMirror 6
          // the *earlier* extension wins, so the run shortcut has to outrank it explicitly
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { run.current(); return true; } }])),
          basicSetup,
          lang.current.of(sql({ dialect: SQLite, schema: latest.current, upperCaseKeywords: true })),
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
    // the editor is created once per task; the schema is swapped in below without losing what was typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the table list loads after the editor is built — reconfigure rather than remount, so typed SQL survives
  useEffect(() => {
    view.current?.dispatch({
      effects: lang.current.reconfigure(sql({ dialect: SQLite, schema: latest.current, upperCaseKeywords: true })),
    });
  }, [sig]);

  return <div className="editor" ref={host} />;
}
