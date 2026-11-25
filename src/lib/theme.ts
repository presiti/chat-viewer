/** Colour palettes and theme presets for the client's own look (not part of Synology). */

export const GROUP_COLORS: { id: string; label: string; value: string }[] = [
  { id: "amber", label: "호박", value: "#e3bf78" },
  { id: "orange", label: "주황", value: "#e6a070" },
  { id: "rose", label: "장미", value: "#e48d9a" },
  { id: "pink", label: "분홍", value: "#dd9cc6" },
  { id: "violet", label: "보라", value: "#b7a4e3" },
  { id: "indigo", label: "남색", value: "#9ea6e6" },
  { id: "blue", label: "파랑", value: "#86aee6" },
  { id: "sky", label: "하늘", value: "#7fc3e2" },
  { id: "teal", label: "청록", value: "#7fcbc4" },
  { id: "green", label: "초록", value: "#93cfa4" },
  { id: "lime", label: "연두", value: "#bcd68a" },
  { id: "gray", label: "회색", value: "#a9b0ba" },
];
export const DEFAULT_GROUP_COLOR = "#e3bf78";

export const ACCENTS: { id: string; label: string; light: string; dark: string }[] = [
  { id: "blue", label: "파랑", light: "#3f7cd9", dark: "#7fa6e6" },
  { id: "indigo", label: "남색", light: "#5457c9", dark: "#9a9ee0" },
  { id: "violet", label: "보라", light: "#7a5fc4", dark: "#b39ddb" },
  { id: "pink", label: "분홍", light: "#c2588d", dark: "#dc9bbd" },
  { id: "red", label: "빨강", light: "#c9534f", dark: "#e08a86" },
  { id: "orange", label: "주황", light: "#d27a3a", dark: "#e6a878" },
  { id: "amber", label: "호박", light: "#b8862b", dark: "#dcbb6e" },
  { id: "green", label: "초록", light: "#3f9a5e", dark: "#86c69a" },
  { id: "teal", label: "청록", light: "#2f8f8a", dark: "#7cc4bf" },
  { id: "slate", label: "회색", light: "#5b6675", dark: "#aab4c0" },
];

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  accent: string; // ACCENTS id
  /** Sidebar colours per mode. */
  sidebar: { light: { bg: string; fg: string }; dark: { bg: string; fg: string } };
  /** Optional page background tint per mode. */
  page?: { light?: { bg: string; muted: string; border: string }; dark?: { bg: string; muted: string; border: string } };
  /** Presets that only make sense in the dark; the picker hints this. */
  darkOnly?: boolean;
}

/* Muted, low-saturation palettes: sidebar tints sit close to the page background so the eye rests. */
export const THEME_PRESETS: ThemePreset[] = [
  { id: "default", name: "기본", description: "짙은 회청색 사이드바, 차분한 파랑", accent: "blue", sidebar: { light: { bg: "#222733", fg: "#c3c8d2" }, dark: { bg: "#111318", fg: "#a6adb9" } } },
  { id: "graphite", name: "그라파이트", description: "무채색, 밝은 사이드바", accent: "slate", sidebar: { light: { bg: "#e9ebef", fg: "#3b4350" }, dark: { bg: "#1a1d23", fg: "#b4bac5" } } },
  { id: "midnight", name: "미드나이트", description: "남보라 밤하늘", accent: "indigo", sidebar: { light: { bg: "#26273f", fg: "#c3c6e4" }, dark: { bg: "#13142a", fg: "#a3a7cf" } }, page: { dark: { bg: "#121322", muted: "#1a1b2e", border: "#272842" } } },
  { id: "deepsea", name: "딥 블루", description: "깊은 바다색, 눈이 편한 저채도 파랑", accent: "blue", sidebar: { light: { bg: "#1d2a3c", fg: "#b9c6d8" }, dark: { bg: "#0e1620", fg: "#95a5b9" } }, page: { dark: { bg: "#111a24", muted: "#16212d", border: "#233140" } }, darkOnly: true },
  { id: "forest", name: "포레스트", description: "짙은 이끼색", accent: "green", sidebar: { light: { bg: "#1f2d26", fg: "#b9cdbf" }, dark: { bg: "#111a15", fg: "#93ab9a" } }, page: { dark: { bg: "#121916", muted: "#18211c", border: "#25322a" } } },
  { id: "olive", name: "올리브", description: "따뜻한 올리브 그린", accent: "amber", sidebar: { light: { bg: "#2a2d22", fg: "#c9ccb6" }, dark: { bg: "#17190f", fg: "#a6a98f" } }, page: { dark: { bg: "#17180f", muted: "#1f2015", border: "#2e3022" } }, darkOnly: true },
  { id: "mocha", name: "모카", description: "갈색 톤, 밤에 보기 편한 따뜻함", accent: "orange", sidebar: { light: { bg: "#2f2621", fg: "#d2c3b8" }, dark: { bg: "#1a1512", fg: "#b2a295" } }, page: { light: { bg: "#fdfaf7", muted: "#f6f0ea", border: "#eadfd5" }, dark: { bg: "#1b1714", muted: "#231e1a", border: "#352d27" } } },
  { id: "plum", name: "플럼", description: "자두색, 은은한 분홍 강조", accent: "pink", sidebar: { light: { bg: "#322232", fg: "#d6c3d3" }, dark: { bg: "#1b1320", fg: "#b39fb6" } }, page: { dark: { bg: "#19141d", muted: "#221b27", border: "#352b3a" } }, darkOnly: true },
  { id: "slate", name: "슬레이트", description: "푸른빛 도는 회색", accent: "teal", sidebar: { light: { bg: "#2a3038", fg: "#c0c8d2" }, dark: { bg: "#161a20", fg: "#9ea8b4" } }, page: { dark: { bg: "#171b21", muted: "#1d2229", border: "#2a313a" } } },
  { id: "ocean", name: "오션", description: "청록 사이드바", accent: "teal", sidebar: { light: { bg: "#1b3238", fg: "#b6d2d6" }, dark: { bg: "#0f1d21", fg: "#8fb1b6" } }, page: { dark: { bg: "#10191c", muted: "#162124", border: "#223034" } } },
  { id: "sunset", name: "선셋", description: "따뜻한 갈색과 주황", accent: "orange", sidebar: { light: { bg: "#3a2a22", fg: "#e2cfc2" }, dark: { bg: "#1f1612", fg: "#c0a898" } }, page: { light: { bg: "#fffaf5", muted: "#fbf1e8", border: "#efe0d1" }, dark: { bg: "#1b1512", muted: "#241c18", border: "#382c25" } } },
  { id: "rose", name: "로즈", description: "자주색 사이드바", accent: "pink", sidebar: { light: { bg: "#3e2535", fg: "#e3cadb" }, dark: { bg: "#221219", fg: "#c0a3b5" } }, page: { dark: { bg: "#1a1216", muted: "#231a1f", border: "#372a31" } } },
];

export const FONT_SCALES: { value: number; label: string }[] = [
  { value: 0.9, label: "작게" },
  { value: 1, label: "보통" },
  { value: 1.1, label: "크게" },
  { value: 1.25, label: "더 크게" },
];

export type TextureId = "none" | "grain" | "dots" | "grid" | "halftone" | "hex" | "contour";
export const TEXTURES: { id: TextureId; label: string; hint: string }[] = [
  { id: "none", label: "없음", hint: "깔끔한 단색" },
  { id: "grain", label: "입자", hint: "필름처럼 또렷한 입자" },
  { id: "dots", label: "점 격자", hint: "도트 페이퍼" },
  { id: "grid", label: "방안 격자", hint: "얇은 선 격자" },
  { id: "halftone", label: "하프톤", hint: "점이 한쪽으로 옅어지는 인쇄 느낌" },
  { id: "hex", label: "벌집", hint: "육각 패턴" },
  { id: "contour", label: "등고선", hint: "완만한 곡선" },
];

export interface Appearance {
  mode: "system" | "light" | "dark";
  theme: string;
  /** ACCENTS id, a custom "#rrggbb" from the colour wheel, or null = the preset's accent. */
  accent: string | null;
  fontScale: number;
  /** -50..50: shifts the lightness of backgrounds (page and sidebar). */
  brightness: number;
  /** 0..200 (%): scales the saturation of backgrounds and accent; 100 = the preset as designed. */
  saturation: number;
  texture: TextureId;
  /** 0..100: how strongly the effect shows on the sidebar / on the chat area (the sidebar takes more by default). */
  textureSide: number;
  textureMain: number;
}
export const DEFAULT_APPEARANCE: Appearance = { mode: "system", theme: "default", accent: null, fontScale: 1, brightness: 0, saturation: 100, texture: "none", textureSide: 70, textureMain: 40 };

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
export const resolveMode = (a: Appearance): "light" | "dark" => (a.mode === "system" ? (systemDark() ? "dark" : "light") : a.mode);

/* --- colour helpers (hex <-> HSL) so brightness / saturation can be applied to any preset --- */
export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, sat = 0;
  if (d) {
    sat = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, sat, l];
}
export function hslToHex(h: number, sat: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
/** Lightness shifts by `bright` (-50..50 → ±15 points); saturation is scaled (and gently lifted for near-greys so the slider is visible). */
function tune(hex: string, bright: number, sat: number): string {
  if (bright === 0 && sat === 100) return hex;
  const [h, s, l] = hexToHsl(hex);
  const s2 = sat > 100 ? Math.min(1, s * (sat / 100) + (sat - 100) / 100 * 0.12) : s * (sat / 100);
  return hslToHex(h, Math.min(1, Math.max(0, s2)), Math.min(0.97, Math.max(0.03, l + (bright / 50) * 0.15)));
}

const BASE_PAGE = {
  light: { bg: "#ffffff", muted: "#f4f5f9", border: "#e3e6ee" },
  dark: { bg: "#222633", muted: "#2b3040", border: "#3a4058" },
};

const svg = (inner: string, w: number, h: number) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${inner}</svg>`)}")`;
/** Opaque greyscale noise centred on mid-grey: neutral under `overlay`, so it only adds speckle (earlier alpha-noise was invisible). */
export const grain = (k: number, base = 0.5) => svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='${k} 0 0 0 ${(base-k*0.5).toFixed(2)}  ${k} 0 0 0 ${(base-k*0.5).toFixed(2)}  ${k} 0 0 0 ${(base-k*0.5).toFixed(2)}  0 0 0 0 1'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, 240, 240);
export const GRAIN = grain(1.6);

/** Pattern per texture, drawn only from a highlight and a shadow of the surface (no hue of its own). `mask` fades it across the region. */
function patternLayer(id: TextureId, dark: boolean): { image: string; size: string; blend: string; mask: string } | null {
  const hi = dark ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.28)"; // white would vanish on a light surface, so light regions use a faint shadow instead
  switch (id) {
    case "grain": return dark
      ? { image: grain(1.2), size: "240px 240px", blend: "overlay", mask: "none" }
      : { image: grain(0.5, 0.88), size: "240px 240px", blend: "multiply", mask: "none" }; // overlay does nothing on white, so light surfaces get a gentle darkening speckle
    case "dots": return { image: svg(`<circle cx='7' cy='7' r='1' fill='${hi}'/>`, 14, 14), size: "14px 14px", blend: "normal", mask: "none" };
    case "grid": return { image: svg(`<path d='M0 .5H18M.5 0V18' stroke='${hi}' fill='none'/>`, 18, 18), size: "18px 18px", blend: "normal", mask: "none" };
    case "halftone": return { image: svg(`<circle cx='3' cy='3' r='1.5' fill='${hi}'/>`, 6, 6), size: "6px 6px", blend: "normal", mask: "linear-gradient(160deg,#000 0%,transparent 75%)" };
    case "hex": return { image: svg(`<path fill='${hi}' fill-rule='evenodd' d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/>`, 28, 49), size: "28px 49px", blend: "normal", mask: "none" };
    case "contour": return { image: svg(`<path d='M0 14Q30 0 60 14T120 14' stroke='${hi}' fill='none'/>`, 120, 28), size: "120px 28px", blend: "normal", mask: "none" };
    default: return null;
  }
}

export interface ThemeColors { vars: Record<string, string>; accentHex: string; mode: "light" | "dark" }

/** A picked colour ("#rrggbb" in `accent`) keeps its hue and saturation; lightness is set per mode so it always reads on the surface. */
export function customAccent(v: string | null | undefined): { id: string; label: string; light: string; dark: string } | null {
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) return null;
  const [h, sat] = hexToHsl(v);
  return { id: v, label: "직접 고른 색", light: hslToHex(h, Math.min(0.7, sat), 0.46), dark: hslToHex(h, Math.min(0.7, sat), 0.7) };
}

/** All colour variables for an appearance (also used by the theme picker so its previews match what gets applied). */
export function themeColors(a: Appearance, mode: "light" | "dark"): ThemeColors {
  const preset = THEME_PRESETS.find((t) => t.id === a.theme) ?? THEME_PRESETS[0];
  const accent = customAccent(a.accent) ?? ACCENTS.find((x) => x.id === (a.accent ?? preset.accent)) ?? ACCENTS[0];
  const br = a.brightness ?? 0, sat = a.saturation ?? 100;
  const page = preset.page?.[mode] ?? BASE_PAGE[mode];
  const accentHex = tune(mode === "dark" ? accent.dark : accent.light, 0, sat);
  const vars: Record<string, string> = {
    "--accent": accentHex,
    "--accent-fg": mode === "dark" ? "#0b0f17" : "#ffffff",
    "--fg-sidebar": preset.sidebar[mode].fg,
  };
  if (mode === "dark") {
    // Surface ramp: the preset only supplies hue and saturation; lightness steps are fixed so the sidebar,
    // chat, cards and dividers always read as separate layers (no shadows needed). Brightness moves the whole ramp.
    const [sh, ss] = hexToHsl(preset.sidebar.dark.bg);
    const [ph, ps] = hexToHsl(page.bg);
    const shift = (br / 50) * 0.08;
    const surface = (h: number, s0: number, l: number) => hslToHex(h, Math.min(0.55, Math.max(0.04, s0 * (sat / 100))), Math.min(0.9, Math.max(0.03, l + shift)));
    vars["--bg-sidebar"] = surface(sh, Math.max(ss, 0.2), 0.08);
    vars["--bg"] = surface(ph, Math.max(ps, 0.16), 0.165);
    vars["--bg-muted"] = surface(ph, Math.max(ps, 0.16), 0.205);
    vars["--border"] = surface(ph, Math.max(ps, 0.16), 0.27);
    vars["--border-strong"] = surface(ph, Math.max(ps, 0.16), 0.31);
    vars["--fg-sidebar"] = "#c4cada";
  } else {
    vars["--bg-sidebar"] = tune(preset.sidebar.light.bg, br, sat);
    vars["--bg"] = tune(page.bg, br, sat);
    vars["--bg-muted"] = tune(page.muted, br, sat);
    vars["--border"] = tune(page.border, br, sat);
    vars["--border-strong"] = tune(page.border, br - 6, sat);
  }
  // Text/overlay colour that reads on the sidebar: white on dark sidebars, near-black on light ones (e.g. 그라파이트).
  const [, , sl] = hexToHsl(vars["--bg-sidebar"]);
  vars["--ink-sidebar"] = sl > 0.6 ? "#161a22" : "#ffffff";
  return { vars, accentHex, mode };
}

/** Writes the appearance onto <html>: data-mode, CSS variables, texture layers and the zoom used for font size. */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  const mode = resolveMode(a);
  root.dataset.mode = mode;
  root.classList.toggle("dark", mode === "dark");
  const { vars } = themeColors(a, mode);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // Each region gets its pattern tinted for its own surface (the sidebar can be dark while the page is light).
  const on = a.texture !== "none";
  const level = (v: number | undefined, dflt: number) => (on ? Math.min(1, (v ?? dflt) / 100) * (a.texture === "grain" ? 0.7 : 1) : 0); // grain tops out at 70% of its raw strength
  const side = patternLayer(a.texture, hexToHsl(vars["--bg-sidebar"])[2] < 0.5);
  const main = patternLayer(a.texture, hexToHsl(vars["--bg"])[2] < 0.5);
  for (const [k, l] of [["side", side], ["main", main]] as const) {
    root.style.setProperty(`--tex-image-${k}`, l ? l.image : "none");
    root.style.setProperty(`--tex-size-${k}`, l ? l.size : "auto");
    root.style.setProperty(`--tex-blend-${k}`, l ? l.blend : "normal");
    root.style.setProperty(`--tex-mask-${k}`, l ? l.mask : "none");
  }
  root.style.setProperty("--tex-opacity-side", String(level(a.textureSide, 70)));
  root.style.setProperty("--tex-opacity-main", String(level(a.textureMain, 40)));
  // `zoom` scales the whole layout (px-based Tailwind sizes included); WebKit supports it.
  (root.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(a.fontScale);
}

/** Re-applies when the OS theme flips while in "system" mode. */
export function watchSystemTheme(get: () => Appearance) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const h = () => { if (get().mode === "system") applyAppearance(get()); };
  mq.addEventListener("change", h);
  return () => mq.removeEventListener("change", h);
}
