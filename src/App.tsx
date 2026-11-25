import { useEffect } from "react";
import { auth } from "./api/client";
import { useSession } from "./store/session";
import { LoginForm } from "./components/LoginForm";
import { Main } from "./pages/Main";
import { ImageWindow } from "./pages/ImageWindow";
import { imageWindowTarget } from "./lib/platform";
import { installWindowDrag } from "./lib/windowDrag";
import { installChatCopy } from "./lib/chatCopy";

export default function App() {
  const status = useSession((s) => s.status);
  const setLoggedIn = useSession((s) => s.setLoggedIn);
  const setLoggedOut = useSession((s) => s.setLoggedOut);

  useEffect(() => installWindowDrag(), []);
  useEffect(() => installChatCopy(), []);

  useEffect(() => {
    auth.restore().then((info) => (info ? setLoggedIn(info) : setLoggedOut())).catch(() => setLoggedOut());
  }, [setLoggedIn, setLoggedOut]);

  if (status === "booting") return <div className="h-full titlebar-drag" />;
  if (status === "loggedOut") return <LoginForm />;
  if (imageWindowTarget) return <ImageWindow channelId={imageWindowTarget.channelId} postId={imageWindowTarget.postId} />;
  return <Main />;
}
