// File kinds by extension. Kept in sync with KIND_EXTS in src-tauri/src/index.rs.
export interface FileKind { key: string; label: string; exts: string[] }

export const FILE_KINDS: FileKind[] = [
  { key: "image", label: "이미지", exts: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "tif", "tiff", "avif"] },
  { key: "video", label: "동영상", exts: ["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "mpg", "mpeg"] },
  { key: "audio", label: "오디오", exts: ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma"] },
  { key: "pdf", label: "PDF", exts: ["pdf"] },
  { key: "doc", label: "문서", exts: ["doc", "docx", "hwp", "hwpx", "txt", "rtf", "md", "odt", "pages"] },
  { key: "sheet", label: "스프레드시트", exts: ["xls", "xlsx", "xlsm", "csv", "tsv", "ods", "numbers"] },
  { key: "slide", label: "프레젠테이션", exts: ["ppt", "pptx", "key", "odp"] },
  { key: "archive", label: "압축", exts: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "dmg", "iso"] },
  { key: "code", label: "코드", exts: ["js", "ts", "tsx", "jsx", "py", "rs", "java", "kt", "c", "cpp", "h", "hpp", "cs", "go", "json", "yaml", "yml", "xml", "html", "css", "scss", "sh", "sql", "swift", "rb", "php", "ipynb", "toml", "ini", "log"] },
  { key: "other", label: "기타", exts: [] },
];

/** Lowercase extension of a file name ("" when none). */
export function extOf(name: string | undefined): string {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return "";
  const e = name.slice(i + 1).toLowerCase();
  return e.length <= 10 && !e.includes(" ") ? e : "";
}

export function kindOf(name: string | undefined): string {
  const e = extOf(name);
  return FILE_KINDS.find((k) => k.exts.includes(e))?.key ?? "other";
}

/** Normalises a user-typed extension list ("pdf, .xlsx") → ["pdf","xlsx"]. */
export function parseExts(text: string): string[] {
  return text.split(/[\s,]+/).map((t) => t.replace(/^\./, "").toLowerCase()).filter(Boolean);
}

/** All extensions covered by the built-in kinds ("기타" = none of these). */
const KNOWN = new Set(FILE_KINDS.flatMap((k) => k.exts));

/**
 * Resolves selected kind keys (built-in or user-defined) plus typed extensions into what the index
 * understands: a flat extension list, and whether "기타" (unknown extension) is wanted.
 */
export function resolveFileFilter(kindKeys: string[], typedExts: string[], kinds: FileKind[]): { exts: string[]; other: boolean } {
  const exts = new Set(typedExts);
  let other = false;
  for (const key of kindKeys) {
    if (key === "other") { other = true; continue; }
    const k = kinds.find((x) => x.key === key);
    for (const e of k?.exts ?? []) exts.add(e);
  }
  return { exts: [...exts], other };
}

/** Client-side counterpart of the index filter, for results that come from the server. */
export function matchesFileFilter(name: string | undefined, kindKeys: string[], typedExts: string[], kinds: FileKind[] = FILE_KINDS): boolean {
  if (kindKeys.length === 0 && typedExts.length === 0) return true;
  const { exts, other } = resolveFileFilter(kindKeys, typedExts, kinds);
  const e = extOf(name);
  if (exts.includes(e)) return true;
  return other && !KNOWN.has(e);
}
