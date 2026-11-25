import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { chat, profile } from "../../api/client";
import { useChat, userLabel } from "../../store/chat";
import { useSession } from "../../store/session";
import { Avatar } from "../Avatar";
import { colorFor, initials } from "../../lib/format";
import { Dialog, fieldClass, ghostBtn, primaryBtn } from "../Dialog";

/** My profile: picture, nickname, description, e-mail, "always offline". Saved through SYNO.Chat.User set v3. */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const me = useSession((s) => s.info?.user_id);
  const user = useChat((s) => (me ? s.users[me] : undefined));
  const onUserUpsert = useChat((s) => s.onUserUpsert);
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [description, setDescription] = useState(String(user?.user_props?.description ?? ""));
  const [email, setEmail] = useState(String(user?.user_props?.email ?? ""));
  const [alwaysOffline, setAlwaysOffline] = useState(!!user?.user_props?.is_always_offline);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** "사진 제거" pressed: applied on save (the picture is replaced by the coloured initials). */
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const avatarUrl = useChat((s) => (me ? s.avatarUrls[me] : undefined));

  if (!me || !user) return null;

  const pickAvatar = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { setError("PNG, JPG, GIF, WebP 이미지만 올릴 수 있습니다."); return; }
    if (f.size > 5 * 1024 * 1024) { setError("이미지는 5MB 이하여야 합니다."); return; }
    setError(null); setAvatarFile(f); setPreview(URL.createObjectURL(f)); setRemoveAvatar(false);
  };
  // A picture can be removed whenever one is shown: a custom upload (avatar_version > 0) or any picture the server serves
  // for me (some accounts carry a DSM picture with version 0). A freshly picked file is just dropped instead.
  const hasAvatar = (user?.avatar_version ?? 0) > 0 || !!avatarUrl;
  const clearAvatar = () => {
    if (fileInput.current) fileInput.current.value = "";
    if (avatarFile) { setAvatarFile(null); setPreview(null); return; }
    setRemoveAvatar(true);
  };

  /** Refreshes my user record (avatar_version etc.) and drops the cached avatar URL. */
  const refreshMe = async () => {
    const users = await chat.listUsers().catch(() => null);
    const mine = users?.find((u) => u.user_id === me);
    if (mine) onUserUpsert(mine);
    useChat.setState((s) => { const avatarUrls = { ...s.avatarUrls }; delete avatarUrls[me]; return { avatarUrls }; });
  };

  const save = async () => {
    setBusy(true); setError(null); setNotice(null);
    const warnings: string[] = [];
    try {
      const fields: Record<string, unknown> = {};
      if (nickname.trim() && nickname.trim() !== user.nickname) fields.nickname = nickname.trim();
      if (alwaysOffline !== !!user.user_props?.is_always_offline) fields.is_always_offline = alwaysOffline;
      if (Object.keys(fields).length) await profile.set(fields);
      // Description/e-mail live in user_props; the server may reject them for some account types, so they are best-effort.
      if (description !== String(user.user_props?.description ?? "") || email !== String(user.user_props?.email ?? "")) {
        try { await profile.set({ user_props: { ...(user.user_props ?? {}), description, email } }); } catch { warnings.push("소개/이메일은 서버가 받지 않았습니다."); }
      }
      if (avatarFile) {
        const bytes = Array.from(new Uint8Array(await avatarFile.arrayBuffer()));
        await profile.setAvatar(avatarFile.name, bytes);
      } else if (removeAvatar && hasAvatar) {
        await profile.removeAvatar();
      }
      await refreshMe();
      if (warnings.length) setNotice(warnings.join(" ")); else onClose();
    } catch (e) {
      setError(`저장 실패: ${(e as { message?: string })?.message ?? e}`);
    } finally { setBusy(false); }
  };

  return (
    <Dialog title="내 프로필" onClose={onClose} width={440} footer={<><button className={ghostBtn} onClick={onClose}>취소</button><button className={primaryBtn} disabled={busy} onClick={() => void save()}>{busy ? "저장 중…" : "저장"}</button></>}>
      <div className="flex items-center gap-4 mb-4">
        <button type="button" className="relative group rounded-lg" title="프로필 사진 변경" onClick={() => fileInput.current?.click()}>
          {preview ? <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
            : removeAvatar ? <div className="h-16 w-16 rounded-lg flex items-center justify-center font-semibold text-white text-[26px] select-none" style={{ background: colorFor(me) }} aria-label={userLabel(user)}>{initials(userLabel(user))}</div>
            : <Avatar userId={me} size={64} />}
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white opacity-0 group-hover:opacity-100"><Camera className="w-5 h-5" /></span>
        </button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
        <div className="min-w-0">
          <div className="font-semibold text-[15px] truncate">{userLabel(user)}</div>
          <div className="text-[12px] text-[var(--fg-muted)]">@{user.username}</div>
          <div className="mt-1 flex items-center gap-3 text-[12px]">
            <button type="button" className="text-[var(--accent)] hover:underline" onClick={() => fileInput.current?.click()}>사진 변경…</button>
            {(avatarFile || (hasAvatar && !removeAvatar)) && (
              <button type="button" className="inline-flex items-center gap-1 text-[var(--fg-muted)] hover:text-red-500" onClick={clearAvatar}><Trash2 className="w-3 h-3" />{avatarFile ? "선택 취소" : "사진 제거"}</button>
            )}
            {removeAvatar && !avatarFile && <span className="text-[var(--fg-muted)]">저장하면 사진이 제거됩니다 · <button type="button" className="hover:underline" onClick={() => setRemoveAvatar(false)}>되돌리기</button></span>}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <label className="block text-[12px] text-[var(--fg-muted)]">닉네임<input className={`${fieldClass} mt-1`} value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={64} /></label>
        <label className="block text-[12px] text-[var(--fg-muted)]">소개<textarea className={`${fieldClass} mt-1 min-h-[64px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="직책, 담당 업무 등" /></label>
        <label className="block text-[12px] text-[var(--fg-muted)]">이메일<input className={`${fieldClass} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={alwaysOffline} onChange={(e) => setAlwaysOffline(e.target.checked)} /> 항상 오프라인으로 표시 (부재 중)</label>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        {notice && <p className="text-[12px] text-amber-600">{notice}</p>}
        <p className="text-[11px] text-[var(--fg-muted)]">비밀번호는 DSM 계정 설정에서 바꿉니다. 여기서 바꾼 내용은 공식 앱에도 그대로 반영됩니다.</p>
      </div>
    </Dialog>
  );
}
