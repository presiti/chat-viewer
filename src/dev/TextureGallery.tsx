// Dev only (`/?gallery`): candidate surface textures shown on a miniature of the real layout, with real theme colours.
import { useMemo, useState } from "react";
import { DEFAULT_APPEARANCE, GRAIN, THEME_PRESETS, themeColors } from "../lib/theme";

const svg = (inner: string, w: number, h: number) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${inner}</svg>`)}")`;
const isDark = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5; };

interface Layer { image: string; size?: string; blend?: string; mask?: string }
type Maker = (hi: string, lo: string, bg: string) => Layer;

/** Every pattern is built only from a highlight and a shadow of the surface itself (white/black at low alpha): no hue of its own. */
const CANDIDATES: { id: number; name: string; note: string; make: Maker }[] = [
  { id: 1, name: "입자", note: "지금 있는 것 (비교용)", make: () => ({ image: GRAIN, size: "240px 240px", blend: "overlay" }) },
  { id: 2, name: "점 격자", note: "도트 페이퍼", make: (hi) => ({ image: svg(`<circle cx='7' cy='7' r='1' fill='${hi}'/>`, 14, 14) }) },
  { id: 3, name: "방안 격자", note: "얇은 선 격자", make: (hi) => ({ image: svg(`<path d='M0 .5H18M.5 0V18' stroke='${hi}' fill='none'/>`, 18, 18) }) },
  { id: 4, name: "사선 해칭", note: "45° 가는 선", make: (hi, lo) => ({ image: svg(`<path d='M-1 1L1 -1M0 8L8 0M7 9L9 7' stroke='${lo}' fill='none'/><path d='M-1 2L2 -1M1 8L8 1M6 10L10 6' stroke='${hi}' fill='none' transform='translate(1 0)'/>`, 8, 8) }) },
  { id: 5, name: "헤어라인", note: "가로 미세 선 (브러시드)", make: (hi, lo) => ({ image: svg(`<rect y='0' width='4' height='1' fill='${hi}'/><rect y='2' width='4' height='1' fill='${lo}'/>`, 4, 4) }) },
  { id: 6, name: "캔버스 위브", note: "가로세로 직조", make: (hi, lo) => ({ image: svg(`<rect x='0' y='0' width='4' height='2' fill='${hi}'/><rect x='4' y='4' width='4' height='2' fill='${hi}'/><rect x='0' y='4' width='2' height='4' fill='${lo}'/><rect x='4' y='0' width='2' height='4' fill='${lo}'/>`, 8, 8) }) },
  { id: 7, name: "하프톤", note: "점이 한쪽으로 옅어짐", make: (hi) => ({ image: svg(`<circle cx='3' cy='3' r='1.5' fill='${hi}'/>`, 6, 6), mask: "linear-gradient(160deg,#000 0%,transparent 75%)" }) },
  { id: 8, name: "벌집", note: "육각 패턴", make: (hi) => ({ image: svg(`<path fill='${hi}' fill-rule='evenodd' d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/>`, 28, 49) }) },
  { id: 9, name: "퀼팅", note: "마름모 누빔", make: (hi, lo) => ({ image: svg(`<path d='M0 10L10 0L20 10L10 20Z' stroke='${lo}' fill='none' stroke-width='1'/><path d='M0 11L10 1L20 11L10 21Z' stroke='${hi}' fill='none' stroke-width='1'/>`, 20, 20) }) },
  { id: 10, name: "리브", note: "세로 골 (코듀로이)", make: (hi, lo) => ({ image: svg(`<rect x='0' width='1' height='4' fill='${hi}'/><rect x='3' width='2' height='4' fill='${lo}'/>`, 6, 4) }) },
  { id: 11, name: "등고선", note: "완만한 곡선", make: (hi) => ({ image: svg(`<path d='M0 14Q30 0 60 14T120 14' stroke='${hi}' fill='none'/>`, 120, 28) }) },
  { id: 12, name: "엠보스 도트", note: "볼록한 점 (진짜 입체)", make: (hi, lo, bg) => ({ image: svg(`<circle cx='8.7' cy='8.7' r='2.6' fill='${lo}'/><circle cx='7.3' cy='7.3' r='2.6' fill='${hi}'/><circle cx='8' cy='8' r='2.2' fill='${bg}'/>`, 16, 16) }) },
];

function Region({ bg, strength, cand, className, children }: { bg: string; strength: number; cand: (typeof CANDIDATES)[number]; className?: string; children: React.ReactNode }) {
  const dark = isDark(bg);
  const layer = cand.make(dark ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.9)", dark ? "rgba(0,0,0,.35)" : "rgba(0,0,0,.14)", bg);
  return (
    <div className={className} style={{ flex: className === "grow" ? 1 : "none", background: bg, position: "relative", isolation: "isolate" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", backgroundImage: layer.image, backgroundSize: layer.size, mixBlendMode: layer.blend as never, opacity: strength / 100, WebkitMaskImage: layer.mask, maskImage: layer.mask }} />
      {children}
    </div>
  );
}

function Mini({ cand, vars, side, main, big }: { cand: (typeof CANDIDATES)[number]; vars: Record<string, string>; side: number; main: number; big?: boolean }) {
  const dark = isDark(vars["--bg"]);
  const fg = dark ? "#eceef4" : "#181b25", muted = dark ? "#a3a9ba" : "#5b6272";
  const ink = vars["--ink-sidebar"];
  const rows = ["내 컬렉션", "# 일반", "# 디자인", "개발", "민지"];
  return (
    <div style={{ display: "flex", height: "100%", fontSize: big ? 14 : 11, color: fg, fontFamily: "system-ui, 'Apple SD Gothic Neo', sans-serif" }}>
      <Region bg={vars["--bg-sidebar"]} strength={side} cand={cand} className="" >
        <div style={{ width: big ? 220 : 96, height: "100%", padding: big ? 14 : 8, boxSizing: "border-box", color: `color-mix(in srgb, ${ink} 80%, transparent)`, boxShadow: `inset -1px 0 0 ${vars["--border-strong"]}` }}>
          {rows.map((r, i) => (
            <div key={r} style={{ padding: big ? "7px 10px" : "4px 6px", borderRadius: 6, marginBottom: 2, ...(i === 2 ? { background: vars["--accent"], color: vars["--accent-fg"], fontWeight: 500 } : {}) }}>{r}</div>
          ))}
        </div>
      </Region>
      <Region bg={vars["--bg"]} strength={main} cand={cand} className="grow">
        <div style={{ flex: 1, height: "100%", padding: big ? 18 : 9, boxSizing: "border-box", minWidth: big ? 520 : 150 }}>
          {[["민지", "오늘 배포 일정 확인 부탁드려요"], ["준호", "네, 4시쯤 가능합니다"]].map(([n, t]) => (
            <div key={n} style={{ marginBottom: big ? 14 : 7 }}><b>{n}</b> <span style={{ color: muted, fontSize: "0.85em" }}>15:14</span><div>{t}</div></div>
          ))}
          <div style={{ marginTop: big ? 24 : 10, padding: big ? "10px 12px" : "5px 6px", borderRadius: 8, background: vars["--bg-muted"], border: `1px solid ${vars["--border"]}`, color: muted }}>메시지 보내기</div>
        </div>
      </Region>
    </div>
  );
}

export default function TextureGallery() {
  const [mode, setMode] = useState<"light" | "dark">(new URLSearchParams(location.search).get("m") === "light" ? "light" : "dark");
  const [theme, setTheme] = useState("default");
  const [side, setSide] = useState(70);
  const [main, setMain] = useState(40);
  const [sel, setSel] = useState(2);
  const vars = useMemo(() => themeColors({ ...DEFAULT_APPEARANCE, theme, mode }, mode).vars, [theme, mode]);
  const cur = CANDIDATES.find((c) => c.id === sel)!;
  const chip = (on: boolean) => ({ padding: "4px 10px", borderRadius: 6, border: "1px solid #8884", background: on ? "#3f7cd9" : "transparent", color: on ? "#fff" : "inherit", cursor: "pointer" });
  return (
    <div style={{ minHeight: "100vh", padding: 24, boxSizing: "border-box", background: mode === "dark" ? "#0c0d11" : "#e9ebf0", color: mode === "dark" ? "#eceef4" : "#181b25", fontFamily: "system-ui, 'Apple SD Gothic Neo', sans-serif", fontSize: 13 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <b style={{ fontSize: 16 }}>질감 후보</b>
        <button style={chip(mode === "dark")} onClick={() => setMode("dark")}>다크</button>
        <button style={chip(mode === "light")} onClick={() => setMode("light")}>라이트</button>
        <select value={theme} onChange={(e) => setTheme(e.target.value)} style={{ padding: 4 }}>{THEME_PRESETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <label>사이드바 {side} <input type="range" min={0} max={100} value={side} onChange={(e) => setSide(+e.target.value)} /></label>
        <label>본문 {main} <input type="range" min={0} max={100} value={main} onChange={(e) => setMain(+e.target.value)} /></label>
        <span style={{ opacity: 0.7 }}>카드를 누르면 크게 보여요</span>
      </div>
      <div style={{ height: 300, borderRadius: 10, overflow: "hidden", border: "1px solid #8884", marginBottom: 6 }}><Mini cand={cur} vars={vars} side={side} main={main} big /></div>
      <div style={{ marginBottom: 16 }}><b>{cur.id}. {cur.name}</b> <span style={{ opacity: 0.7 }}>{cur.note}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {CANDIDATES.map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} style={{ textAlign: "left", padding: 0, background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            <div style={{ height: 150, borderRadius: 8, overflow: "hidden", outline: sel === c.id ? "2px solid #3f7cd9" : "1px solid #8884" }}><Mini cand={c} vars={vars} side={side} main={main} /></div>
            <div style={{ padding: "6px 2px" }}><b>{c.id}. {c.name}</b> <span style={{ opacity: 0.7 }}>· {c.note}</span></div>
          </button>
        ))}
      </div>
    </div>
  );
}
