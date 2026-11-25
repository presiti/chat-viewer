; NSIS hooks for the Chat Viewer installer (see tauri.conf.json bundle.windows.nsis.installerHooks).
; A real uninstall must leave nothing behind: the app data folder (session, local search index, settings)
; lives under %APPDATA%\co.duo.chat-viewer and the WebView2 cache under %LOCALAPPDATA%\co.duo.chat-viewer.
; An in-app update runs the old uninstaller with /UPDATE ($UpdateMode = 1): keep the data then, or every
; update would sign the user out and drop the search index.

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$APPDATA\co.duo.chat-viewer"
    RMDir /r "$LOCALAPPDATA\co.duo.chat-viewer"
  ${EndIf}
!macroend
