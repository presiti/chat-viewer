import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Bell, ExternalLink, Eye, EyeOff, FolderPlus, Folders, GripVertical, ListOrdered, Monitor, Moon, Palette, Pencil, Pin, Pipette, PinOff, RefreshCw, Search, Settings, SlidersHorizontal, Sun, Trash2, X } from "lucide-react";
import { ACCENTS, DEFAULT_GROUP_COLOR, FONT_SCALES, GROUP_COLORS, TEXTURES, THEME_PRESETS, customAccent, hexToHsl, hslToHex, resolveMode, themeColors } from "../lib/theme";
import type { Channel } from "../api/types";
import { channelLabel, useChat } from "../store/chat";
import { useSession } from "../store/session";
import { useUi, type ManageTab } from "../store/ui";
import { useSync } from "../store/sync";
import { formatDateTime } from "../lib/format";
import { buildSections, groupKey, isGroupKey, isLocalHidden, isServerHidden, isUnavailableDm, sectionDefs, type Entry, type SectionKey, type SectionSort } from "../lib/sidebarOrder";
import { IconButton } from "../components/IconButton";
import { fieldClass, primaryBtn } from "../components/Dialog";
import { NotificationSettingsTable } from "../components/dialogs/NotificationSettingsDialog";
import { Popover } from "../components/Popover";
import { ChannelIcon } from "../components/ChannelIcon";
import { NOTIFY_SOUNDS, testNotification } from "../store/notify";
import { openNotificationSettings } from "../lib/external";
import { StatusSettings } from "../components/StatusSettings";
import { confirmAsk } from "../lib/confirm";

const TABS: { key: ManageTab; label: string; icon: React.ReactNode }[] = [
  { key: "sections", label: "정렬 · 고정 · 숨기기", icon: <ListOrdered className="w-4 h-4" /> },
  { key: "groups", label: "그룹", icon: <Folders className="w-4 h-4" /> },
  { key: "hidden", label: "숨긴 채널", icon: <EyeOff className="w-4 h-4" /> },
  { key: "notifications", label: "알림", icon: <Bell className="w-4 h-4" /> },
  { key: "appearance", label: "모양 · 테마", icon: <Palette className="w-4 h-4" /> },
];
const SORTS: { key: SectionSort; label: string; hint: string }[] = [
  { key: "recent", label: "최근 활동순", hint: "마지막 메시지가 최근인 방부터" },
  { key: "name", label: "이름순", hint: "가나다 · ABC 순" },
  { key: "manual", label: "직접 정렬", hint: "손잡이를 끌거나 위/아래 버튼으로 순서를 정합니다" },
];
/** Circular colour picker: angle = hue, distance from the centre = saturation. Lightness is set per mode by the theme. */
function ColorWheel({ value, onPick }: { value: string | null; onPick: (hex: string) => void }) {
  const SIZE = 132;
  const [h, sat] = value && /^#[0-9a-f]{6}$/i.test(value) ? hexToHsl(value) : [0, 0];
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
    onPick(hslToHex(hue, Math.min(1, Math.hypot(dx, dy) / (r.width / 2)), 0.5));
  };
  const rad = ((h - 90) * Math.PI) / 180, dist = Math.min(1, sat) * (SIZE / 2);
  return (
    <div
      role="slider" aria-label="강조 색 팔레트" aria-valuetext={value ?? "테마 기본값"} tabIndex={0}
      className="relative shrink-0 cursor-crosshair touch-none rounded-full border border-[var(--border)]"
      style={{ width: SIZE, height: SIZE, background: "radial-gradient(circle, #808080 0%, rgba(128,128,128,0) 70%), conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
      onPointerMove={(e) => { if (e.buttons) pick(e); }}
    >
      {value && <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]" style={{ left: SIZE / 2 + Math.cos(rad) * dist, top: SIZE / 2 + Math.sin(rad) * dist, background: value }} />}
    </div>
  );
}

/** Small colour-wheel swatch next to the preset accents; opens the wheel in a popover (closes on outside click / Esc). */
function WheelButton({ value, onPick }: { value: string | null; onPick: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" title="색상환에서 직접 고르기" aria-label="색상환에서 직접 고르기" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={clsx("flex h-7 w-7 items-center justify-center rounded-full border-2 text-[var(--fg-muted)] hover:text-[var(--fg)]", value ? "border-[var(--fg)]" : "border-dashed border-[var(--border-strong)] hover:border-[var(--fg-muted)]")}
        style={value ? { background: value } : undefined}>
        {!value && <Pipette className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="popover absolute left-0 top-9 z-40 p-3">
          <ColorWheel value={value} onPick={onPick} />
          <p className="mt-2 w-[132px] text-[11px] leading-snug text-[var(--fg-muted)]">가장자리일수록 진한 색, 가운데는 회색. 밝기는 모드에 맞춰 자동 조정됩니다.</p>
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean) => clsx("rounded-full px-2.5 py-[3px] border text-[12px]", on ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]");

/** This device's system notifications: on/off, sound, dock badge, and a test button. */
function DeviceNotifySettings() {
  const dn = useUi((s) => s.desktopNotify);
  const set = useUi((s) => s.setDesktopNotify);
  const replyGlobal = useUi((s) => s.replyNotify.global);
  const setReplyGlobal = useUi((s) => s.setReplyNotifyGlobal);
  const readReceipts = useUi((s) => s.readReceipts);
  const setReadReceipts = useUi((s) => s.setReadReceipts);
  const serverSetting = useSession((s) => s.serverSetting);
  const receiptsAllowed = !!serverSetting?.allow_read_status;
  const [msg, setMsg] = useState<string | null>(null);
  const sel = "rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12.5px]";
  return (
    <section className="mb-6 rounded-md border border-[var(--border)] p-4">
            <p className="mb-2 text-[11.5px] text-[var(--fg-muted)]">개발 빌드에서는 알림이 "Script Editor" 이름으로 표시됩니다. 처음 한 번 macOS가 허용 여부를 물으면 허용해 주세요. 시스템 설정 → 알림에서 Script Editor가 꺼져 있으면 보이지 않습니다.</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <span className="inline-flex rounded-md border border-[var(--border)] overflow-hidden text-[12.5px]">
          {([["off", "끔"], ["silent", "무음 (알림 센터만)"], ["sound", "소리"]] as const).map(([k, label]) => (
            <button key={k} type="button" className={clsx("px-3 py-1", dn.mode === k ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "hover:bg-[var(--hover)]")} onClick={() => set({ mode: k })}>{label}</button>
          ))}
        </span>
        {dn.mode === "sound" && <label className="flex items-center gap-1.5">알림음 <select className={sel} value={dn.sound} onChange={(e) => set({ sound: e.target.value })}>{NOTIFY_SOUNDS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>}
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={dn.badge} onChange={(e) => set({ badge: e.target.checked })} /> Dock 아이콘에 안 읽은 수 표시</label>
        <label className="flex items-center gap-1.5 cursor-pointer" title="이 앱에서만 동작합니다. 채널별 표에서 채널마다 바꿀 수 있고, 스레드마다 끌 수도 있습니다."><input type="checkbox" checked={replyGlobal} onChange={(e) => setReplyGlobal(e.target.checked)} /> 내가 관련 없는 스레드의 댓글에도 알림 (기본값)</label>
        <label className={clsx("flex items-center gap-1.5", receiptsAllowed ? "cursor-pointer" : "opacity-60 cursor-not-allowed")} title={receiptsAllowed ? "내 메시지 옆에 아직 읽지 않은 사람 수(1:1은 1)를 표시합니다. 보고 있는 채널만 10초마다 서버에 묻습니다." : serverSetting ? "NAS 관리자가 Synology Chat의 '읽음 상태 표시'를 꺼 두었습니다." : "서버 설정을 아직 확인하지 못했습니다."}>
          <input type="checkbox" checked={readReceipts && receiptsAllowed} disabled={!receiptsAllowed} onChange={(e) => setReadReceipts(e.target.checked)} /> 내 메시지 읽음 표시 (안 읽은 사람 수){!receiptsAllowed && serverSetting && <span className="text-[11px] text-[var(--fg-muted)]">· 서버에서 꺼짐</span>}
        </label>
        <button type="button" className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[12.5px] hover:bg-[var(--hover)]" disabled={dn.mode === "off"} onClick={() => void testNotification().then((e) => setMsg(e ?? "테스트 알림을 보냈습니다. 알림 센터를 확인하세요."))}>테스트 알림</button>
        <button type="button" className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[12.5px] hover:bg-[var(--hover)] inline-flex items-center gap-1" title="OS 알림 설정을 엽니다" onClick={openNotificationSettings}>시스템 알림 설정 열기 <ExternalLink className="w-3 h-3" /></button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--fg-muted)]">채널별 "데스크톱" 수준(모든 메시지 · 멘션만 · 없음)과 음소거, 그리고 위의 알림 일시 중지를 따릅니다. 보고 있는 채널의 메시지는 알리지 않습니다.{msg && <span className="ml-2 text-[var(--fg)]">{msg}</span>}</p>
    </section>
  );
}

function FilterBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg-muted)]" />
      <input className={`${fieldClass} !pl-7 !pr-7 !py-1 !text-[12.5px] w-[240px]`} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] hover:text-[var(--fg)]" onClick={() => onChange("")}><X className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

const ROW_H = 34;

/**
 * Rows per page that fit between the list's top edge and the bottom of the window (pager + padding reserved),
 * so the pager is always visible without scrolling. Re-measured on resize.
 */
function useFitRows(ref: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  const [rows, setRows] = useState(20);
  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const avail = window.innerHeight - top - 96; // pager + footnote + padding
      setRows(Math.max(5, Math.floor(avail / ROW_H)));
    };
    measure();
    const t = setTimeout(measure, 50); // after layout settles (tab switch)
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

/** Simple pager for long lists: shows at most `size` rows and page buttons. */
function usePaged<T>(items: T[], resetKey: unknown, size: number) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey, items.length]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const cur = Math.min(page, pages - 1);
  return { slice: items.slice(cur * size, cur * size + size), page: cur, pages, setPage, offset: cur * size, size };
}
function Pager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i).filter((i) => i === 0 || i === pages - 1 || Math.abs(i - page) <= 2);
  return (
    <div className="flex items-center gap-1 pt-2 text-[12px]">
      <span className="text-[var(--fg-muted)] mr-2">{page * size + 1}–{Math.min(total, (page + 1) * size)} / {total}</span>
      <button type="button" className="rounded px-2 py-0.5 border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--hover)]" disabled={page === 0} onClick={() => onPage(page - 1)}>이전</button>
      {nums.map((i, idx) => (
        <span key={i} className="flex items-center">
          {idx > 0 && nums[idx - 1] !== i - 1 && <span className="px-1 text-[var(--fg-muted)]">…</span>}
          <button type="button" className={clsx("rounded px-2 py-0.5 border", i === page ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--border)] hover:bg-[var(--hover)]")} onClick={() => onPage(i)}>{i + 1}</button>
        </span>
      ))}
      <button type="button" className="rounded px-2 py-0.5 border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--hover)]" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>다음</button>
    </div>
  );
}

function SyncStatus() {
  const status = useSync((s) => s.status);
  const lastSyncAt = useSync((s) => s.lastSyncAt);
  const error = useSync((s) => s.error);
  const syncNow = useSync((s) => s.syncNow);
  return (
    <div className="flex items-center gap-2 text-[11px] text-[var(--fg-muted)]">
      <RefreshCw className={clsx("w-3.5 h-3.5", status === "syncing" && "animate-spin")} />
      <span>설정 동기화(내 공간): {status === "syncing" ? "동기화 중…" : status === "error" ? `실패 — ${error}` : status === "off" ? error : lastSyncAt ? `마지막 ${formatDateTime(lastSyncAt)}` : "대기 중"}</span>
      <button type="button" className="text-[var(--accent)] hover:underline disabled:opacity-50" disabled={status === "syncing"} onClick={() => void syncNow()}>지금 동기화</button>
    </div>
  );
}

/** Full-page sidebar management: ordering/pinning/hiding per section, custom groups, hidden channels, notifications. */
export function Manage() {
  const tab = useUi((s) => s.manageTab);
  const section = useUi((s) => s.manageSection);
  const pending = useUi((s) => s.managePendingChannel);
  const openManage = useUi((s) => s.openManage);
  const prefs = useUi((s) => s.sidebar);
  const setSectionSort = useUi((s) => s.setSectionSort);
  const setManualOrder = useUi((s) => s.setManualOrder);
  const togglePinnedTop = useUi((s) => s.togglePinnedTop);
  const setUnreadFirst = useUi((s) => s.setUnreadFirst);
  const setLocalHidden = useUi((s) => s.setLocalHidden);
  const setShowUnreadSection = useUi((s) => s.setShowUnreadSection);
  const addGroup = useUi((s) => s.addGroup);
  const renameGroup = useUi((s) => s.renameGroup);
  const removeGroup = useUi((s) => s.removeGroup);
  const setGroupOrder = useUi((s) => s.setGroupOrder);
  const assignGroup = useUi((s) => s.assignGroup);
  const setGroupColor = useUi((s) => s.setGroupColor);
  const appearance = useUi((s) => s.appearance);
  const setAppearance = useUi((s) => s.setAppearance);
  const channelTabs = useUi((s) => s.channelTabs);
  const setChannelTabsEnabled = useUi((s) => s.setChannelTabsEnabled);
  const channels = useChat((s) => s.channels);
  const users = useChat((s) => s.users);
  const me = useSession((s) => s.info?.user_id);
  const hideChannel = useChat((s) => s.hideChannel);
  const showChannel = useChat((s) => s.showChannel);
  const [filter, setFilter] = useState("");
  const [groupSel, setGroupSel] = useState<string | null>(isGroupKey(section) ? section.slice(2) : null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  /** Order of the channel checklist inside a group. */
  const [listSort, setListSort] = useState<"recent" | "name">("recent");
  const [drag, setDrag] = useState<number | null>(null);
  /** Row whose "숨기기" menu is open, with the button it hangs from (portal popover: never clipped). */
  const [hideMenu, setHideMenu] = useState<{ ch: Channel; anchor: HTMLElement } | null>(null);
  useEffect(() => {
    if (!hideMenu) return;
    const close = () => setHideMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [hideMenu]);
  /** Slot index the dragged row would land in, and the cursor-following ghost. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ label: string; x: number; y: number; width: number } | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  const sections = useMemo(() => buildSections(channels, users, me, prefs), [channels, users, me, prefs]);
  const defs = useMemo(() => sectionDefs(prefs), [prefs]);
  const k = filter.trim().toLowerCase();
  const matches = (label: string) => !k || label.toLowerCase().includes(k);
  const allEntries = useMemo(
    () => Object.values(channels).filter((c) => c.is_joined && c.type !== "synobot").map((c) => ({ ch: c, label: channelLabel(c, users, me), unavailableDm: isUnavailableDm(c, users, me) })).sort((a, b) => a.label.localeCompare(b.label, "ko")),
    [channels, users, me],
  );
  const hiddenServer = useMemo(() => Object.values(channels).filter((c) => c.is_joined && isServerHidden(c)), [channels]);
  const hiddenLocal = useMemo(() => Object.values(channels).filter((c) => c.is_joined && isLocalHidden(c, prefs) && !isServerHidden(c)), [channels, prefs]);

  // Arriving from "새 그룹에 넣기…": focus the name box; the channel joins the group once it is created.
  useEffect(() => { if (tab === "groups" && pending != null) newNameRef.current?.focus(); }, [tab, pending]);
  useEffect(() => { if (isGroupKey(section)) setGroupSel(section.slice(2)); }, [section]);
  // Never show the right pane empty when groups exist: fall back to the first one.
  useEffect(() => { if (tab === "groups" && prefs.groups.length && !prefs.groups.some((g) => g.id === groupSel)) setGroupSel(prefs.groups[0].id); }, [tab, prefs.groups, groupSel]);

  const reorder = (sec: string, list: Entry[], fromId: number, toIndex: number) => {
    const ids = list.map((e) => e.ch.channel_id).filter((id) => id !== fromId);
    ids.splice(toIndex, 0, fromId);
    if (prefs.sectionSort[sec] !== "manual") setSectionSort(sec, "manual");
    setManualOrder(sec, ids);
  };
  /**
   * Pointer drag with a ghost that follows the cursor and an insertion line showing the exact drop slot.
   * `dropAt` is the index the dragged row will occupy in `list` (0..list.length).
   */
  const startDrag = (ev: React.PointerEvent, id: number, sec: string, list: Entry[], label: string) => {
    const target = ev.currentTarget as HTMLElement;
    const row = target.closest<HTMLElement>("[data-reorder-id]");
    target.setPointerCapture(ev.pointerId);
    setDrag(id);
    setGhost({ label, x: ev.clientX, y: ev.clientY, width: row?.getBoundingClientRect().width ?? 320 });
    let slot: number | null = null;
    const slotAt = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-reorder-id]");
      if (!el) return null;
      const overId = Number(el.dataset.reorderId);
      const i = list.findIndex((e) => e.ch.channel_id === overId);
      if (i < 0) return null;
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2 ? i : i + 1; // upper half → before, lower half → after
    };
    const move = (e: PointerEvent) => {
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      const sidx = slotAt(e.clientX, e.clientY);
      slot = sidx;
      setDropAt(sidx);
    };
    const up = (e: PointerEvent) => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      if (slot != null) {
        const from = list.findIndex((x) => x.ch.channel_id === id);
        // Removing the dragged row shifts later slots up by one.
        const to = slot > from ? slot - 1 : slot;
        if (to !== from) reorder(sec, list, id, to);
      }
      setDrag(null); setDropAt(null); setGhost(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };
  const hideOnServer = async (ch: Channel) => { try { await hideChannel(ch.channel_id); } catch (e) { alert(`숨기기 실패: ${(e as { message?: string })?.message ?? e}`); } };
  const showOnServer = async (ch: Channel) => { try { await showChannel(ch.channel_id); } catch (e) { alert(`다시 표시 실패: ${(e as { message?: string })?.message ?? e}`); } };

  const createGroup = () => {
    const name = newName.trim();
    if (!name) return;
    const g = addGroup(name);
    if (pending != null) assignGroup(pending, g.id);
    setNewName(""); setGroupSel(g.id);
    openManage("groups", { section: groupKey(g.id) });
  };

  // Paged lists (hooks live here, outside the render helpers).
  const groupCandidates = useMemo(
    () => allEntries.filter((e) => matches(e.label)).sort((a, b) => Number(!!a.unavailableDm) - Number(!!b.unavailableDm) || (listSort === "recent" ? b.ch.last_post_at - a.ch.last_post_at : a.label.localeCompare(b.label, "ko"))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEntries, k, listSort],
  );
  const groupListRef = useRef<HTMLUListElement>(null);
  const sectionListRef = useRef<HTMLUListElement>(null);
  const groupRows = useFitRows(groupListRef, [tab, groupSel, k, listSort, prefs.groups.length]);
  const sectionRows = useFitRows(sectionListRef, [tab, section, k]);
  const groupPaged = usePaged(groupCandidates, `${groupSel}|${k}|${listSort}`, groupRows);
  const sectionKeyNow = (sections[section] ? section : "channels") as SectionKey;
  const sectionList = useMemo(() => (sections[sectionKeyNow] ?? []).filter((e) => matches(e.label)), [sections, sectionKeyNow, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const sectionPaged = usePaged(sectionList, `${sectionKeyNow}|${k}`, sectionRows);

  /* ---------- 정렬 · 고정 · 숨기기 ---------- */
  const renderSections = () => {
    const sec = sectionKeyNow;
    const list = sectionList;
    const sort = prefs.sectionSort[sec] ?? "recent";
    // Dragging is always allowed (no filter; groups included): the first drop switches the section to 직접 정렬.
    const canDrag = !k;
    const manualPossible = sort === "manual" && canDrag;
    // Manual ordering works on the whole list; otherwise long sections are paged.
    const visible = manualPossible ? list : sectionPaged.slice;
    const indexOffset = manualPossible ? 0 : sectionPaged.offset;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {defs.map((d) => (
            <button key={d.key} type="button" className={chip(sec === d.key)} onClick={() => openManage("sections", { section: d.key })}>
              {d.title}<span className="ml-1 text-[11px] opacity-70">{(sections[d.key] ?? []).length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--fg-muted)]">정렬</span>
          {SORTS.map((s) => <button key={s.key} type="button" title={s.hint} className={chip(sort === s.key)} onClick={() => setSectionSort(sec, s.key)}>{s.label}</button>)}
          <label className="flex items-center gap-1.5 text-[12px] cursor-pointer ml-2"><input type="checkbox" checked={prefs.unreadFirst} onChange={(e) => setUnreadFirst(e.target.checked)} /> 안 읽은 방 위로</label>
          <label className="flex items-center gap-1.5 text-[12px] cursor-pointer"><input type="checkbox" checked={prefs.showUnreadSection} onChange={(e) => setShowUnreadSection(e.target.checked)} /> "새 메시지" 섹션 표시</label>
          <span className="ml-auto"><FilterBox value={filter} onChange={setFilter} placeholder="이 섹션에서 채널 찾기" /></span>
        </div>
        {k && !isGroupKey(sec) && <p className="text-[11px] text-[var(--fg-muted)]">검색 중에는 순서를 바꿀 수 없습니다. 검색어를 지우면 드래그와 위/아래 버튼이 다시 활성화됩니다.</p>}
        {canDrag && sort !== "manual" && <p className="text-[11px] text-[var(--fg-muted)]">손잡이를 끌어 놓으면 지금 보이는 순서를 기준으로 "직접 정렬"로 바뀝니다.</p>}
        {list.length === 0 && <p className="text-[12px] text-[var(--fg-muted)] py-8 text-center">{k ? "검색 결과가 없습니다." : "표시할 방이 없습니다."}</p>}
        <ul ref={sectionListRef} className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {visible.map((e, vi) => {
            const i = indexOffset + vi;
            const id = e.ch.channel_id;
            const pinned = prefs.pinnedTop.includes(id);
            const fixed = e.ch.type === "synobot";
            return (
              <li
                key={id}
                data-reorder-id={id}
                className={clsx(
                  "relative flex items-center gap-2 px-2 py-1.5 text-[13px] select-none",
                  drag === id && "opacity-30",
                  e.unavailable && "opacity-60",
                  // Insertion line: above this row, or below the last row.
                  drag != null && dropAt === i && "before:absolute before:left-1 before:right-1 before:-top-[1.5px] before:h-[3px] before:rounded before:bg-[var(--accent)] before:content-['']",
                  drag != null && dropAt === list.length && i === list.length - 1 && "after:absolute after:left-1 after:right-1 after:-bottom-[1.5px] after:h-[3px] after:rounded after:bg-[var(--accent)] after:content-['']",
                )}
              >
                <span className={clsx("w-4 text-[var(--fg-muted)] touch-none", canDrag && !fixed ? "cursor-grab active:cursor-grabbing" : "opacity-25")} title={canDrag && !fixed ? "끌어서 순서 변경" : undefined} onPointerDown={(ev) => { if (!canDrag || fixed) return; ev.preventDefault(); startDrag(ev, id, sec, manualPossible ? list : visible, e.label); }}>
                  <GripVertical className="w-4 h-4" />
                </span>
                <span className="flex w-5 shrink-0 items-center justify-center text-[var(--fg-muted)]"><ChannelIcon ch={e.ch} me={me} dm="avatar" /></span>
                <span className="flex-1 truncate">{e.label}{fixed && <span className="ml-1 text-[11px] text-[var(--fg-muted)]">(항상 맨 위)</span>}{e.unavailable && <span className="ml-1 text-[11px] text-[var(--fg-muted)]">(비활성/삭제된 사용자)</span>}</span>
                {manualPossible && !fixed && (
                  <span className="flex">
                    <IconButton size="sm" label="위로" disabled={i === 0} onClick={() => reorder(sec, list, id, Math.max(0, i - 1))}><ArrowUp /></IconButton>
                    <IconButton size="sm" label="아래로" disabled={i === list.length - 1} onClick={() => reorder(sec, list, id, Math.min(list.length - 1, i + 1))}><ArrowDown /></IconButton>
                  </span>
                )}
                {!fixed && <IconButton size="sm" label={pinned ? "맨 위 고정 해제" : "맨 위에 고정"} active={pinned} onClick={() => togglePinnedTop(id)}>{pinned ? <PinOff /> : <Pin />}</IconButton>}
                {!fixed && (
                  <IconButton size="sm" label="숨기기" active={hideMenu?.ch.channel_id === id} onMouseDown={(ev) => ev.stopPropagation()} onClick={(ev) => setHideMenu((m) => (m?.ch.channel_id === id ? null : { ch: e.ch, anchor: ev.currentTarget }))}><EyeOff /></IconButton>
                )}
              </li>
            );
          })}
        </ul>
        {!manualPossible && <Pager page={sectionPaged.page} pages={sectionPaged.pages} total={list.length} size={sectionPaged.size} onPage={sectionPaged.setPage} />}
        {ghost && (
          <div className="pointer-events-none fixed z-[80] flex items-center gap-2 rounded-md border border-[var(--accent)] bg-[var(--bg)] px-3 py-1.5 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,.25)] opacity-95" style={{ left: ghost.x + 14, top: ghost.y - 16, width: Math.min(ghost.width, 360) }}>
            <GripVertical className="w-4 h-4 text-[var(--fg-muted)]" /><span className="truncate">{ghost.label}</span>
          </div>
        )}
        {hideMenu && (
          <Popover anchor={hideMenu.anchor} align="right" side="bottom">
            <div className="popover w-[220px] py-1 text-[12.5px]" onMouseDown={(ev) => ev.stopPropagation()}>
              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { const ch = hideMenu.ch; setHideMenu(null); void hideOnServer(ch); }}>모든 기기에서 숨기기<span className="block text-[11px] text-[var(--fg-muted)]">새 메시지가 오면 다시 표시</span></button>
              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover)]" onClick={() => { const id = hideMenu.ch.channel_id; setHideMenu(null); setLocalHidden(id, true); }}>이 앱에서만 숨기기<span className="block text-[11px] text-[var(--fg-muted)]">새 메시지가 와도 숨김 유지</span></button>
            </div>
          </Popover>
        )}
      </div>
    );
  };

  /* ---------- 그룹 ---------- */
  const renderGroups = () => {
    const sel = prefs.groups.find((g) => g.id === groupSel) ?? null;
    const move = (id: string, dir: -1 | 1) => { const ids = prefs.groups.map((g) => g.id); const i = ids.indexOf(id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; setGroupOrder(ids); };
    const pendingLabel = pending != null && channels[pending] ? channelLabel(channels[pending], users, me) : null;
    const candidates = groupCandidates;
    const paged = groupPaged;
    return (
      <div className="flex gap-6 min-h-[360px]">
        <div className="w-[260px] shrink-0">
          <div className="flex gap-1.5 mb-3">
            <input ref={newNameRef} className={`${fieldClass} !py-1 !text-[13px]`} placeholder="새 그룹 이름" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createGroup(); }} />
            <button type="button" className={`${primaryBtn} !py-1 shrink-0 inline-flex items-center gap-1`} disabled={!newName.trim()} onClick={createGroup}><FolderPlus className="w-3.5 h-3.5" /> 만들기</button>
          </div>
          {pendingLabel && <p className="mb-2 rounded-md bg-[var(--accent)]/8 px-2.5 py-1.5 text-[12px]">새 그룹을 만들면 <b>{pendingLabel}</b> 채널이 바로 들어갑니다. 기존 그룹에 넣으려면 오른쪽 목록에서 체크하세요.</p>}
          {prefs.groups.length === 0 && <p className="text-[12px] text-[var(--fg-muted)] py-2">아직 그룹이 없습니다. 이름을 입력해 만들면 사이드바에 섹션으로 나타납니다.</p>}
          <ul className="space-y-0.5">
            {prefs.groups.map((g, i) => (
              <li key={g.id} className={clsx("group/g flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] cursor-pointer", sel?.id === g.id ? "bg-[var(--accent)]/12 text-[var(--accent)]" : "hover:bg-[var(--hover)]")} onClick={() => { setGroupSel(g.id); setRenaming(null); }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color ?? DEFAULT_GROUP_COLOR }} />
                {renaming === g.id ? (
                  <input autoFocus className={`${fieldClass} !py-0.5 !text-[13px] flex-1`} value={renameText} maxLength={40} onChange={(e) => setRenameText(e.target.value)} onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === "Enter") { renameGroup(g.id, renameText); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} onBlur={() => { if (renameText.trim()) renameGroup(g.id, renameText); setRenaming(null); }} />
                ) : (
                  <span className="flex-1 truncate">{g.name}</span>
                )}
                <span className="text-[11px] text-[var(--fg-muted)] tabular-nums">{g.channelIds.length}</span>
                <span className={clsx("flex", sel?.id === g.id ? "" : "opacity-0 group-hover/g:opacity-100")}>
                  <IconButton size="sm" label="위로" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(g.id, -1); }}><ArrowUp /></IconButton>
                  <IconButton size="sm" label="아래로" disabled={i === prefs.groups.length - 1} onClick={(e) => { e.stopPropagation(); move(g.id, 1); }}><ArrowDown /></IconButton>
                  <IconButton size="sm" label="이름 변경" onClick={(e) => { e.stopPropagation(); setRenaming(g.id); setRenameText(g.name); }}><Pencil /></IconButton>
                  <IconButton size="sm" label="삭제 (채널은 원래 섹션으로)" onClick={async (e) => { e.stopPropagation(); if (await confirmAsk(`"${g.name}" 그룹을 삭제할까요? 채널은 원래 섹션으로 돌아갑니다.`)) { removeGroup(g.id); if (groupSel === g.id) setGroupSel(null); } }}><Trash2 /></IconButton>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1 min-w-0">
          {sel ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="h-3 w-3 rounded-full" style={{ background: sel.color ?? DEFAULT_GROUP_COLOR }} />
                <span className="font-semibold text-[14px] truncate">{sel.name}</span>
                <span className="flex items-center gap-1 ml-1" title="그룹 색상">
                  {GROUP_COLORS.map((c) => (
                    <button key={c.id} type="button" title={c.label} onClick={() => setGroupColor(sel.id, c.value)} className={clsx("h-4 w-4 rounded-full border-2", (sel.color ?? DEFAULT_GROUP_COLOR) === c.value ? "border-[var(--fg)]" : "border-transparent hover:border-[var(--fg-muted)]")} style={{ background: c.value }} />
                  ))}
                </span>
                <span className="text-[12px] text-[var(--fg-muted)]">{sel.channelIds.length}개 채널</span>
</div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <FilterBox value={filter} onChange={setFilter} placeholder="채널 찾기" />
                <span className="text-[12px] text-[var(--fg-muted)] ml-1">목록 정렬</span>
                <button type="button" className={chip(listSort === "recent")} onClick={() => setListSort("recent")}>최근 활동순</button>
                <button type="button" className={chip(listSort === "name")} onClick={() => setListSort("name")}>이름순</button>
              </div>
              <p className="text-[12px] text-[var(--fg-muted)] mb-2">체크한 채널은 원래 섹션에서 빠져 이 그룹에만 보입니다. 다른 그룹에 있던 채널은 이 그룹으로 옮겨집니다.</p>
              <ul ref={groupListRef} className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
                {paged.slice.map((e) => {
                  const inThis = sel.channelIds.includes(e.ch.channel_id);
                  const other = prefs.groups.find((g) => g.id !== sel.id && g.channelIds.includes(e.ch.channel_id));
                  return (
                    <li key={e.ch.channel_id} className={clsx("flex items-center gap-2 px-2 py-1.5 text-[13px]", e.unavailableDm && "opacity-60")}>
                      <input type="checkbox" checked={inThis} onChange={(ev) => assignGroup(e.ch.channel_id, ev.target.checked ? sel.id : null)} />
                      <span className="flex w-5 shrink-0 items-center justify-center text-[var(--fg-muted)]"><ChannelIcon ch={e.ch} me={me} dm="avatar" /></span>
                      <span className="flex-1 truncate">{e.label}{e.unavailableDm && <span className="ml-1 text-[11px] text-[var(--fg-muted)]">(비활성/삭제된 사용자)</span>}</span>
                      {other && <span className="text-[11px] text-[var(--fg-muted)]">{other.name}</span>}
                    </li>
                  );
                })}
              </ul>
              <Pager page={paged.page} pages={paged.pages} total={candidates.length} size={paged.size} onPage={paged.setPage} />
            </>
          ) : (
            <div className="h-full min-h-[280px] rounded-lg border border-dashed border-[var(--border)] flex flex-col items-center justify-center text-center px-8 py-10">
              <Folders className="w-9 h-9 text-[var(--fg-muted)] mb-3" />
              <div className="font-semibold text-[14px] mb-1">아직 그룹이 없습니다</div>
              <p className="text-[12.5px] text-[var(--fg-muted)] max-w-[380px] leading-relaxed">
                그룹은 채널을 내 기준으로 묶어 사이드바에 섹션으로 보여주는 기능입니다. 예를 들어 "프로젝트 A", "관제"처럼 만들어 두면 관련 채널이 한곳에 모입니다.
              </p>
              <ol className="mt-4 text-left text-[12.5px] space-y-1 text-[var(--fg)]">
                <li>1. 왼쪽 위 입력칸에 그룹 이름을 적고 <b>만들기</b></li>
                <li>2. 오른쪽에 나타나는 채널 목록에서 넣을 채널을 체크</li>
                <li>3. 사이드바에 그룹 섹션이 생기고, 체크한 채널은 그쪽으로 이동</li>
              </ol>
              <button type="button" className={`${primaryBtn} mt-5 inline-flex items-center gap-1.5`} onClick={() => newNameRef.current?.focus()}><FolderPlus className="w-4 h-4" /> 첫 그룹 만들기</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ---------- 모양 · 테마 ---------- */
  const renderAppearance = () => {
    const mode = resolveMode(appearance);
    const preset = THEME_PRESETS.find((t) => t.id === appearance.theme) ?? THEME_PRESETS[0];
    return (
      <div className="space-y-7 max-w-[760px]">
        <section>
          <h3 className="text-[13px] font-semibold mb-2">색상 모드</h3>
          <div className="flex gap-2">
            {([["system", "시스템 설정", <Monitor key="m" className="w-4 h-4" />], ["light", "라이트", <Sun key="s" className="w-4 h-4" />], ["dark", "다크", <Moon key="d" className="w-4 h-4" />]] as const).map(([k, label, icon]) => (
              <button key={k} type="button" onClick={() => setAppearance({ mode: k })} className={clsx("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px]", appearance.mode === k ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]")}>{icon}{label}</button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">테마</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {THEME_PRESETS.map((t) => {
              const tc = themeColors({ ...appearance, theme: t.id, accent: null }, mode).vars;
              const sb = { bg: tc["--bg-sidebar"], fg: tc["--fg-sidebar"] };
              const ac = { dark: tc["--accent"], light: tc["--accent"] };
              const pg = { bg: tc["--bg"] };
              return (
                <button key={t.id} type="button" onClick={() => setAppearance({ theme: t.id, accent: null })} className={clsx("rounded-lg border p-2 text-left", appearance.theme === t.id ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/25" : "border-[var(--border)] hover:bg-[var(--hover)]")}>
                  <div className="flex h-14 overflow-hidden rounded-md border border-[var(--border)]">
                    <div className="w-1/3" style={{ background: sb.bg }}><div className="mx-2 mt-2 h-1.5 w-8 rounded" style={{ background: sb.fg, opacity: 0.6 }} /><div className="mx-2 mt-1 h-1.5 w-6 rounded" style={{ background: sb.fg, opacity: 0.35 }} /></div>
                    <div className="flex-1 p-2" style={{ background: pg?.bg ?? (mode === "dark" ? "#15171c" : "#ffffff") }}><div className="h-1.5 w-10 rounded" style={{ background: mode === "dark" ? ac.dark : ac.light }} /><div className="mt-1 h-1.5 w-16 rounded" style={{ background: mode === "dark" ? "#8b919c" : "#9ca3af", opacity: 0.5 }} /></div>
                  </div>
                  <div className="mt-1.5 text-[13px] font-medium">{t.name}{t.darkOnly && <span className="ml-1 rounded bg-[var(--bg-muted)] px-1 text-[10px] font-normal text-[var(--fg-muted)]">밤</span>}</div>
                  <div className="text-[11px] text-[var(--fg-muted)]">{t.description}</div>
                </button>
              );
            })}
          </div>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">강조 색 <span className="font-normal text-[12px] text-[var(--fg-muted)]">· 버튼, 선택 표시, 링크 (비우면 테마 기본값: {ACCENTS.find((a) => a.id === preset.accent)?.label})</span></h3>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" title={a.label} onClick={() => setAppearance({ accent: a.id })} className={clsx("h-7 w-7 rounded-full border-2", (appearance.accent ?? preset.accent) === a.id ? "border-[var(--fg)] scale-110" : "border-transparent hover:border-[var(--fg-muted)]")} style={{ background: mode === "dark" ? a.dark : a.light }} />
            ))}
            <WheelButton value={customAccent(appearance.accent) ? appearance.accent : null} onPick={(hex) => setAppearance({ accent: hex })} />
            {appearance.accent && <button type="button" className="text-[12px] text-[var(--accent)] hover:underline ml-1" onClick={() => setAppearance({ accent: null })}>테마 기본값으로</button>}
          </div>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">색감 조절 <span className="font-normal text-[12px] text-[var(--fg-muted)]">· 선택한 테마를 기준으로 조절합니다</span></h3>
          <div className="space-y-3 max-w-[460px]">
            {([
              ["밝기", "brightness", -50, 50, 1, "어둡게", "밝게"],
              ["채도", "saturation", 0, 200, 5, "무채색", "선명하게"],
            ] as const).map(([label, key, min, max, step, lo, hi]) => (
              <label key={key} className="flex items-center gap-3 text-[13px]">
                <span className="w-9 shrink-0">{label}</span>
                <span className="w-14 shrink-0 text-right text-[11px] text-[var(--fg-muted)]">{lo}</span>
                <input type="range" min={min} max={max} step={step} value={appearance[key]} onChange={(e) => setAppearance({ [key]: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                <span className="w-14 shrink-0 text-[11px] text-[var(--fg-muted)]">{hi}</span>
              </label>
            ))}
            {(appearance.brightness !== 0 || appearance.saturation !== 100) && <button type="button" className="text-[12px] text-[var(--accent)] hover:underline" onClick={() => setAppearance({ brightness: 0, saturation: 100 })}>밝기 · 채도 초기화</button>}
          </div>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">질감 <span className="font-normal text-[12px] text-[var(--fg-muted)]">· 화면 위에 얹는 은은한 효과</span></h3>
          <div className="flex flex-wrap gap-2">
            {TEXTURES.map((t) => (
              <button key={t.id} type="button" title={t.hint} onClick={() => setAppearance({ texture: t.id })} className={clsx("rounded-md border px-3 py-1.5 text-[13px]", appearance.texture === t.id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]")}>{t.label}</button>
            ))}
          </div>
          {appearance.texture !== "none" && (
            <div className="mt-3 space-y-2 max-w-[460px]">
              {([["사이드바", "textureSide"], ["본문", "textureMain"]] as const).map(([label, key]) => (
                <label key={key} className="flex items-center gap-3 text-[13px]">
                  <span className="w-14 shrink-0">{label}</span>
                  <input type="range" min={0} max={100} step={5} value={appearance[key]} onChange={(e) => setAppearance({ [key]: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                  <span className="w-10 shrink-0 text-right text-[11px] text-[var(--fg-muted)]">{appearance[key]}%</span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">{TEXTURES.find((t) => t.id === appearance.texture)?.hint}</p>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">글자 크기</h3>
          <div className="flex gap-2">
            {FONT_SCALES.map((f) => (
              <button key={f.value} type="button" onClick={() => setAppearance({ fontScale: f.value })} className={clsx("rounded-md border px-3 py-1.5", appearance.fontScale === f.value ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] hover:bg-[var(--hover)]")} style={{ fontSize: `${13 * f.value}px` }}>{f.label}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">화면 전체가 같은 비율로 커집니다. 메시지·사이드바·메뉴 모두 적용.</p>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">실험 기능</h3>
          <label className="flex items-start gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" className="mt-1" checked={channelTabs.enabled} onChange={(e) => setChannelTabsEnabled(e.target.checked)} />
            <span>
              채널 탭 바 (브라우저 탭처럼 위에 표시)
              <span className="block text-[11.5px] text-[var(--fg-muted)]">연 채널이 채팅 위에 탭으로 쌓입니다. 드래그로 순서 변경, 닫기 버튼 또는 가운데 클릭으로 닫기, 최대 14개. 사이드바는 그대로 두고 접어서 쓰면 공간이 넓어집니다.</span>
            </span>
          </label>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold mb-2">그룹 색 팔레트</h3>
          <div className="flex flex-wrap gap-2">{GROUP_COLORS.map((c) => <span key={c.id} className="inline-flex items-center gap-1 text-[12px]"><span className="h-3.5 w-3.5 rounded-full" style={{ background: c.value }} />{c.label}</span>)}</div>
          <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">그룹 색은 "그룹" 탭이나 사이드바 그룹 제목 우클릭에서 고릅니다.</p>
        </section>
      </div>
    );
  };

  /* ---------- 숨긴 채널 ---------- */
  const hiddenRow = (ch: Channel, restore: () => void) => (
    <li key={ch.channel_id} className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
      <span className="flex w-5 shrink-0 items-center justify-center text-[var(--fg-muted)]"><ChannelIcon ch={ch} me={me} dm="avatar" /></span>
      <span className="flex-1 truncate">{channelLabel(ch, users, me)}</span>
      {ch.unread > 0 && <span className="text-[11px] text-[var(--fg-muted)]">안 읽음 {ch.unread}</span>}
      <button type="button" className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-[3px] text-[12px] hover:bg-[var(--hover)]" onClick={restore}><Eye className="w-3.5 h-3.5" /> 다시 표시</button>
    </li>
  );
  const renderHidden = () => (
    <div className="space-y-5">
      <FilterBox value={filter} onChange={setFilter} placeholder="숨긴 채널 찾기" />
      <section>
        <h3 className="text-[12px] font-semibold text-[var(--fg-muted)] mb-1">모든 기기에서 숨김 <span className="font-normal">· 새 메시지가 오면 자동으로 다시 표시됩니다</span></h3>
        {hiddenServer.filter((c) => matches(channelLabel(c, users, me))).length === 0 ? <p className="text-[12px] text-[var(--fg-muted)] py-3">없음</p> : <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">{hiddenServer.filter((c) => matches(channelLabel(c, users, me))).map((ch) => hiddenRow(ch, () => void showOnServer(ch)))}</ul>}
      </section>
      <section>
        <h3 className="text-[12px] font-semibold text-[var(--fg-muted)] mb-1">이 앱에서만 숨김 <span className="font-normal">· 새 메시지가 와도 숨긴 채로 둡니다</span></h3>
        {hiddenLocal.filter((c) => matches(channelLabel(c, users, me))).length === 0 ? <p className="text-[12px] text-[var(--fg-muted)] py-3">없음</p> : <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">{hiddenLocal.filter((c) => matches(channelLabel(c, users, me))).map((ch) => hiddenRow(ch, () => setLocalHidden(ch.channel_id, false)))}</ul>}
      </section>
    </div>
  );

  const settingsMode = tab === "notifications" || tab === "appearance";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="titlebar-drag h-[52px] shrink-0 flex items-center gap-3 px-5 border-b border-[var(--border)]">
        {settingsMode ? <Settings className="w-4 h-4 text-[var(--fg-muted)]" /> : <SlidersHorizontal className="w-4 h-4 text-[var(--fg-muted)]" />}
        <div className="font-semibold text-[15px]">{settingsMode ? "설정" : "사이드바 관리"}</div>
        <div className="titlebar-nodrag ml-auto"><SyncStatus /></div>
      </header>
      <div className="flex border-b border-[var(--border)] px-3">
        {TABS.filter((t) => (t.key === "notifications" || t.key === "appearance") === settingsMode).map((t) => (
          <button key={t.key} onClick={() => { setFilter(""); openManage(t.key); }} className={clsx("px-3 py-2.5 text-[13px] border-b-2 -mb-px inline-flex items-center gap-1.5", tab === t.key ? "border-[var(--accent)] text-[var(--fg)] font-medium" : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]")}>
            {t.icon}{t.label}
            {t.key === "hidden" && hiddenServer.length + hiddenLocal.length > 0 && <span className="rounded-full bg-[var(--bg-muted)] px-1.5 text-[11px] text-[var(--fg-muted)]">{hiddenServer.length + hiddenLocal.length}</span>}
            {t.key === "groups" && prefs.groups.length > 0 && <span className="rounded-full bg-[var(--bg-muted)] px-1.5 text-[11px] text-[var(--fg-muted)]">{prefs.groups.length}</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "sections" && renderSections()}
        {tab === "groups" && renderGroups()}
        {tab === "hidden" && renderHidden()}
        {tab === "notifications" && <>
          <StatusSettings />
          <h2 className="mb-2 text-[12px] font-semibold text-[var(--fg-muted)]">이 기기에서 알리는 방식</h2>
          <DeviceNotifySettings />
          <h2 className="mb-2 text-[12px] font-semibold text-[var(--fg-muted)]">채널별 알림</h2>
          <NotificationSettingsTable />
        </>}
        {tab === "appearance" && renderAppearance()}
        {!settingsMode && <p className="mt-6 text-[11px] text-[var(--fg-muted)]">정렬·고정·그룹·앱 전용 숨김은 이 앱의 설정이며 내 공간을 통해 다른 기기와 동기화됩니다. "모든 기기에서 숨기기"는 Synology 서버에 저장되어 공식 앱에도 적용됩니다.</p>}
      </div>
    </div>
  );
}
