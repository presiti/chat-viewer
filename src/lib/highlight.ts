import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import csharp from "highlight.js/lib/languages/csharp";
import cpp from "highlight.js/lib/languages/cpp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";

const langs: Record<string, unknown> = { javascript, typescript, python, json, bash, sql, yaml, xml, css, java, csharp, cpp, go, rust, markdown, plaintext };
for (const [name, def] of Object.entries(langs)) hljs.registerLanguage(name, def as never);
hljs.registerAliases(["js", "jsx", "mjs"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["sh", "zsh", "shell"], { languageName: "bash" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["cs"], { languageName: "csharp" });
hljs.registerAliases(["c", "h", "cc", "hpp"], { languageName: "cpp" });
hljs.registerAliases(["rs"], { languageName: "rust" });
hljs.registerAliases(["md"], { languageName: "markdown" });
hljs.registerAliases(["txt", "text", "log"], { languageName: "plaintext" });

export const LANGUAGE_OPTIONS = ["plaintext", "javascript", "typescript", "python", "json", "bash", "sql", "yaml", "xml", "css", "java", "csharp", "cpp", "go", "rust", "markdown"];

/** Returns highlighted HTML (already escaped). `lang` may be a language name, alias, or file extension. */
export function highlight(code: string, lang?: string): string {
  const l = (lang ?? "").toLowerCase().replace(/^\./, "");
  if (l && hljs.getLanguage(l)) {
    try { return hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch { /* fall through */ }
  }
  try { return hljs.highlightAuto(code, LANGUAGE_OPTIONS).value; } catch { return escapeHtml(code); }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Guess a highlight language from a file name. */
export function langFromFilename(name: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && hljs.getLanguage(ext) ? ext : undefined;
}
