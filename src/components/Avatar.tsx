import { useEffect, useState } from "react";
import { useChat, userLabel } from "../store/chat";
import { colorFor, initials } from "../lib/format";

export function Avatar({ userId, size = 36 }: { userId: number; size?: number }) {
  const user = useChat((s) => s.users[userId]);
  const cached = useChat((s) => s.avatarUrls[userId]);
  const avatarFor = useChat((s) => s.avatarFor);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cached === undefined && user) void avatarFor(userId);
  }, [cached, user, userId, avatarFor]);

  const label = userLabel(user);
  // Pin every dimension: Tailwind's preflight gives <img> `max-width: 100%`, so a transiently narrow
  // container (virtual rows re-measuring, flex shrink) could squash the picture into a tall rectangle.
  const style = { width: size, height: size, minWidth: size, maxWidth: size, minHeight: size, maxHeight: size, flex: "none", fontSize: Math.round(size * 0.4) };

  if (cached && !failed) {
    return (
      <img
        src={cached}
        alt={label}
        width={size}
        height={size}
        className="rounded-lg object-cover shrink-0 bg-[var(--bg-muted)] aspect-square"
        style={style}
        onError={() => setFailed(true)}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="rounded-lg shrink-0 flex items-center justify-center font-semibold text-white select-none"
      style={{ ...style, background: colorFor(userId) }}
      aria-label={label}
    >
      {initials(label)}
    </div>
  );
}
