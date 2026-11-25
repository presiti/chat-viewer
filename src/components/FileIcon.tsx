import type { ComponentType } from "react";
import clsx from "clsx";
import {
  Database, File, FileArchive, FileAudio, FileChartColumn, FileCode, FileCog, FileDigit, FileImage, FileJson, FileKey, FileSliders,
  FileSpreadsheet, FileTerminal, FileText, FileType, FileVideo, Presentation, BookOpen, Film, Music,
} from "lucide-react";
import { extOf } from "../lib/fileKinds";

type Icon = ComponentType<{ className?: string }>;
interface Style { icon: Icon; color: string }

/** Per-extension icon + colour. Families share an icon but get their own hue so e.g. xlsx/csv/numbers still differ. */
const BY_EXT: Record<string, Style> = {
  // documents
  pdf: { icon: FileText, color: "#e5484d" },
  doc: { icon: FileText, color: "#2b6cb0" }, docx: { icon: FileText, color: "#2563eb" }, odt: { icon: FileText, color: "#3b82f6" }, pages: { icon: FileText, color: "#f59e0b" },
  hwp: { icon: FileText, color: "#0ea5e9" }, hwpx: { icon: FileText, color: "#06b6d4" },
  txt: { icon: FileType, color: "#6b7280" }, rtf: { icon: FileType, color: "#9ca3af" }, md: { icon: BookOpen, color: "#374151" }, log: { icon: FileTerminal, color: "#4b5563" },
  // spreadsheets
  xls: { icon: FileSpreadsheet, color: "#15803d" }, xlsx: { icon: FileSpreadsheet, color: "#16a34a" }, xlsm: { icon: FileSpreadsheet, color: "#166534" },
  csv: { icon: FileChartColumn, color: "#22c55e" }, tsv: { icon: FileChartColumn, color: "#4ade80" }, ods: { icon: FileSpreadsheet, color: "#059669" }, numbers: { icon: FileSpreadsheet, color: "#10b981" },
  // presentations
  ppt: { icon: Presentation, color: "#c2410c" }, pptx: { icon: Presentation, color: "#ea580c" }, key: { icon: Presentation, color: "#f97316" }, odp: { icon: Presentation, color: "#fb923c" },
  // images
  png: { icon: FileImage, color: "#7c3aed" }, jpg: { icon: FileImage, color: "#8b5cf6" }, jpeg: { icon: FileImage, color: "#8b5cf6" }, gif: { icon: FileImage, color: "#a855f7" },
  webp: { icon: FileImage, color: "#9333ea" }, svg: { icon: FileImage, color: "#6d28d9" }, bmp: { icon: FileImage, color: "#a78bfa" }, heic: { icon: FileImage, color: "#c084fc" }, tif: { icon: FileImage, color: "#7e22ce" }, tiff: { icon: FileImage, color: "#7e22ce" }, avif: { icon: FileImage, color: "#9d4edd" },
  // video
  mp4: { icon: FileVideo, color: "#db2777" }, mov: { icon: Film, color: "#ec4899" }, avi: { icon: FileVideo, color: "#be185d" }, mkv: { icon: FileVideo, color: "#e11d48" }, webm: { icon: FileVideo, color: "#f43f5e" }, m4v: { icon: Film, color: "#f472b6" }, wmv: { icon: FileVideo, color: "#9f1239" },
  // audio
  mp3: { icon: FileAudio, color: "#0d9488" }, wav: { icon: Music, color: "#14b8a6" }, m4a: { icon: FileAudio, color: "#2dd4bf" }, aac: { icon: FileAudio, color: "#0f766e" }, flac: { icon: Music, color: "#115e59" }, ogg: { icon: FileAudio, color: "#5eead4" }, opus: { icon: FileAudio, color: "#99f6e4" },
  // archives / disk images
  zip: { icon: FileArchive, color: "#d97706" }, rar: { icon: FileArchive, color: "#b45309" }, "7z": { icon: FileArchive, color: "#92400e" }, tar: { icon: FileArchive, color: "#a16207" }, gz: { icon: FileArchive, color: "#ca8a04" }, tgz: { icon: FileArchive, color: "#ca8a04" },
  bz2: { icon: FileArchive, color: "#854d0e" }, xz: { icon: FileArchive, color: "#78350f" }, dmg: { icon: FileDigit, color: "#64748b" }, iso: { icon: FileDigit, color: "#475569" },
  // code & config
  js: { icon: FileCode, color: "#eab308" }, ts: { icon: FileCode, color: "#3178c6" }, tsx: { icon: FileCode, color: "#2563eb" }, jsx: { icon: FileCode, color: "#facc15" },
  py: { icon: FileCode, color: "#3572a5" }, rs: { icon: FileCode, color: "#dea584" }, java: { icon: FileCode, color: "#b07219" }, kt: { icon: FileCode, color: "#a97bff" },
  c: { icon: FileCode, color: "#555555" }, cpp: { icon: FileCode, color: "#f34b7d" }, h: { icon: FileCode, color: "#6b7280" }, hpp: { icon: FileCode, color: "#f34b7d" }, cs: { icon: FileCode, color: "#178600" }, go: { icon: FileCode, color: "#00add8" },
  swift: { icon: FileCode, color: "#f05138" }, rb: { icon: FileCode, color: "#701516" }, php: { icon: FileCode, color: "#4f5d95" }, sh: { icon: FileTerminal, color: "#89e051" }, sql: { icon: Database, color: "#e38c00" },
  json: { icon: FileJson, color: "#f59e0b" }, yaml: { icon: FileCog, color: "#cb171e" }, yml: { icon: FileCog, color: "#cb171e" }, toml: { icon: FileCog, color: "#9c4221" }, ini: { icon: FileSliders, color: "#6b7280" }, xml: { icon: FileCode, color: "#0060ac" },
  html: { icon: FileCode, color: "#e34c26" }, css: { icon: FileCode, color: "#563d7c" }, scss: { icon: FileCode, color: "#c6538c" }, ipynb: { icon: FileCode, color: "#da5b0b" },
  pem: { icon: FileKey, color: "#6b7280" }, crt: { icon: FileKey, color: "#6b7280" }, p12: { icon: FileKey, color: "#6b7280" },
};
const FALLBACK: Style = { icon: File, color: "#6b7280" };

export function fileStyle(name: string | undefined): Style & { ext: string } {
  const ext = extOf(name);
  return { ...(BY_EXT[ext] ?? FALLBACK), ext };
}

/** Coloured tile with the type icon and the extension printed underneath, so every extension reads differently. */
export function FileIcon({ name, size = 36, className }: { name: string | undefined; size?: number; className?: string }) {
  const { icon: Icon, color, ext } = fileStyle(name);
  const label = ext.toUpperCase().slice(0, 5);
  const small = size < 30;
  return (
    <span
      className={clsx("relative inline-flex shrink-0 items-center justify-center rounded-md text-white", className)}
      style={{ width: size, height: size, background: color }}
      title={ext || undefined}
    >
      <Icon className={small ? "w-3.5 h-3.5" : "w-[55%] h-[55%]"} />
      {label && !small && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-[3px] bg-[var(--bg)] px-[3px] text-[8px] font-bold leading-[12px] tracking-tight shadow-sm" style={{ color }}>{label}</span>
      )}
    </span>
  );
}
