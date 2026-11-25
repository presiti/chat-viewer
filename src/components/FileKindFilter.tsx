import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2 } from "lucide-react";
import { FILE_KINDS, parseExts, type FileKind } from "../lib/fileKinds";
import { useUi } from "../store/ui";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "./Dialog";

const chip = (on: boolean) => clsx("rounded-full px-2.5 py-[3px] border text-[12px]", on ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]");

/** File kind chips (user-editable, multi-select) plus a free-form extension box. */
export function FileKindFilter({ kinds, onKinds, extText, onExtText }: { kinds: string[]; onKinds: (k: string[]) => void; extText: string; onExtText: (t: string) => void }) {
  const list = useUi((s) => s.fileKinds);
  const [editing, setEditing] = useState(false);
  const toggle = (k: string) => onKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {list.map((k) => <button key={k.key} type="button" title={k.exts.length ? k.exts.join(", ") : "알려진 종류에 속하지 않는 확장자"} onClick={() => toggle(k.key)} className={chip(kinds.includes(k.key))}>{k.label}</button>)}
        <button type="button" title="종류 편집" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"><Settings2 className="w-3.5 h-3.5" /> 편집</button>
        {(kinds.length > 0 || extText.trim() !== "") && <button type="button" onClick={() => { onKinds([]); onExtText(""); }} className="ml-auto rounded-full px-2 py-[3px] text-[12px] text-[var(--accent)] hover:bg-[var(--hover)]">필터 초기화</button>}
      </div>
      <input value={extText} onChange={(e) => onExtText(e.target.value)} placeholder="확장자로 찾기 — 예: pdf, xlsx, hwp" className="w-full rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]" />
      {editing && <FileKindEditor onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Textarea that grows to show all of its content (no inner scrollbar). */
function AutoTextarea({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } }, [value]);
  return <textarea ref={ref} rows={1} autoFocus={autoFocus} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} !py-1.5 !text-[13px] w-full font-mono leading-relaxed resize-none overflow-hidden`} />;
}

/** Chip text for a user-made kind: its extensions ("pdf · xlsx", "+N" beyond three). */
const autoLabel = (exts: string[]) => (exts.length <= 3 ? exts.join(" · ") : `${exts.slice(0, 3).join(" · ")} +${exts.length - 3}`);

/**
 * Editor for the kind chips. Built-in kinds keep their names (edit or delete their extensions); a kind you add
 * is just a list of extensions and its chip is named after them. "기본값 복원" brings back the built-in set.
 */
function FileKindEditor({ onClose }: { onClose: () => void }) {
  const list = useUi((s) => s.fileKinds);
  const setFileKinds = useUi((s) => s.setFileKinds);
  const builtIn = new Set(FILE_KINDS.map((k) => k.key));
  type Row = { key: string; label: string; exts: string; orig: string };
  const toRow = (k: FileKind): Row => ({ key: k.key, label: k.label, exts: k.exts.join(", "), orig: k.exts.join(", ") });
  const [rows, setRows] = useState<Row[]>(list.map(toRow));
  const update = (i: number, exts: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, exts } : x)));
  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i));
  const add = () => setRows((r) => [...r, { key: `u${Date.now().toString(36)}`, label: "", exts: "", orig: "" }]);
  const move = (i: number, d: -1 | 1) => setRows((r) => { const j = i + d; if (j < 0 || j >= r.length) return r; const c = [...r]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const save = () => {
    const kinds: FileKind[] = rows
      .map((r) => {
        const exts = r.key === "other" ? [] : parseExts(r.exts);
        // A kind you made is named after its extensions; keep an older custom name while its extensions are untouched.
        const label = builtIn.has(r.key) || (r.label && r.exts === r.orig) ? r.label : autoLabel(exts);
        return { key: r.key, label: label.trim(), exts };
      })
      .filter((k) => k.label && (k.exts.length > 0 || k.key === "other"));
    setFileKinds(kinds);
    onClose();
  };
  return (
    <Dialog title="파일 종류 편집" onClose={onClose} width={620} footer={<><button className={ghostBtn} onClick={() => setRows(FILE_KINDS.map(toRow))}>기본값 복원</button><span className="flex-1" /><button className={ghostBtn} onClick={onClose}>취소</button><button className={primaryBtn} onClick={save}>저장</button></>}>
      <p className="mb-3 text-[12px] text-[var(--fg-muted)]">칩 하나가 한 줄입니다. 새 종류는 이름 없이 확장자만 적으면 되고, 칩에는 그 확장자가 표시됩니다. 확장자는 쉼표나 띄어쓰기로 구분하고 점(.)은 생략해도 됩니다. 쓰지 않는 종류는 지우세요.</p>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {rows.map((r, i) => {
          const custom = !builtIn.has(r.key);
          return (
            <div key={r.key}>
              <div className="mb-1 flex items-center gap-1">
                <span className="flex-1 truncate text-[13px] font-medium" title={custom ? undefined : r.label}>{custom ? "새 종류" : r.label}</span>
                <button type="button" className="rounded px-1.5 py-1 text-[12px] text-[var(--fg-muted)] hover:bg-[var(--hover)] disabled:opacity-30" disabled={i === 0} title="위로" onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" className="rounded px-1.5 py-1 text-[12px] text-[var(--fg-muted)] hover:bg-[var(--hover)] disabled:opacity-30" disabled={i === rows.length - 1} title="아래로" onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" className="rounded p-1 text-[var(--fg-muted)] hover:bg-red-500/10 hover:text-red-500" title="삭제" onClick={() => remove(i)}><Trash2 className="w-4 h-4" /></button>
              </div>
              {r.key === "other"
                ? <p className="text-[12px] text-[var(--fg-muted)]">어떤 종류에도 없는 확장자 (적을 수 없음)</p>
                : <AutoTextarea value={r.exts} autoFocus={custom && !r.exts} placeholder="확장자 (예: pdf, xlsx, hwp)" onChange={(v) => update(i, v)} />}
            </div>
          );
        })}
      </div>
      <button type="button" className={`${ghostBtn} mt-3 inline-flex items-center gap-1 !py-1`} onClick={add}><Plus className="w-3.5 h-3.5" /> 확장자 종류 추가</button>
    </Dialog>
  );
}
