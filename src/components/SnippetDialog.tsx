import { useState } from "react";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "./Dialog";
import { LANGUAGE_OPTIONS } from "../lib/highlight";
import { useUploads } from "../store/upload";

const EXT: Record<string, string> = { plaintext: "txt", javascript: "js", typescript: "ts", python: "py", json: "json", bash: "sh", sql: "sql", yaml: "yml", xml: "xml", css: "css", java: "java", csharp: "cs", cpp: "cpp", go: "go", rust: "rs", markdown: "md" };

export function SnippetDialog({ channelId, onClose }: { channelId: number; onClose: () => void }) {
  const start = useUploads((s) => s.start);
  const [title, setTitle] = useState("");
  const [lang, setLang] = useState("plaintext");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  const submit = async () => {
    const base = title.trim() || "snippet";
    const fileName = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${EXT[lang] ?? "txt"}`;
    onClose();
    await start(channelId, { bytes: new TextEncoder().encode(content), fileName, message: message.trim() || undefined });
  };

  return (
    <Dialog
      title="스니펫 만들기"
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className={ghostBtn} onClick={onClose}>취소</button>
          <button className={primaryBtn} disabled={!content.trim()} onClick={() => void submit()}>보내기</button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-3">
          <label className="flex-1 space-y-1">
            <span className="text-[12px] text-[var(--fg-muted)]">제목 (파일명)</span>
            <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: config.yml" />
          </label>
          <label className="w-[160px] space-y-1">
            <span className="text-[12px] text-[var(--fg-muted)]">언어</span>
            <select className={fieldClass} value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">내용</span>
          <textarea
            className={`${fieldClass} font-mono text-[12.5px] leading-[1.5] min-h-[260px]`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Tab") { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; setContent(content.slice(0, s) + "  " + content.slice(t.selectionEnd)); requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2)); }
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] text-[var(--fg-muted)]">설명 (선택)</span>
          <input className={fieldClass} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}
