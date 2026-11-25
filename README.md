# Chat Viewer

Synology Chat용 경량 데스크톱 클라이언트. 공식 앱이 DSM 데스크톱 전체를 webview로 띄우는 것과 달리
Chat API만 직접 호출한다.

- Tauri 2 (Rust: 세션 보관, REST 중계, socket.io 실시간) + React 19 + Vite + Tailwind 4 + Tiptap(WYSIWYG 입력창, 전송 시 Synology 마크업으로 변환)
- 기능: 로그인(OTP), 채널 목록·즐겨찾기, 메시지 조회/무한 스크롤, Synology 마크업 서식(툴바·단축키), 이모지 피커·자동완성, 멘션 자동완성,
  파일 업로드(선택·드래그앤드롭·붙여넣기)·다운로드·이미지 뷰어, 스니펫(코드 하이라이트), 반응, 메시지 예약, 투표, 메시지 편집/삭제/고정/북마크,
  게시판(고정·파일·링크·투표, ⌘⇧B), 멤버 패널(⌘⇧M), 채널 설정 모달, 내 컬렉션(북마크·스레드·리마인더·예약), 검색(⌘K, 로컬 FTS5 색인으로 부분 일치 + 서버 검색 병합, 필터·점프), 접히는 사이드바(⌘\), 실시간 수신

공식 클라이언트와 다른 점은 [docs/features.md](docs/features.md), 백로그는 [docs/backlog.md](docs/backlog.md) 참고.

## 개발

```sh
pnpm install
pnpm tauri dev      # Rust 툴체인 필요 (rustup)
pnpm tauri build    # 배포용 .app / .dmg (Windows에서는 -setup.exe)
```

설치·제거와 첫 실행 시 보안 경고 처리는 [docs/install.md](docs/install.md) 참고.

- Rust 빌드는 `src-tauri/.cargo/config.toml`의 `SDKROOT`를 사용한다(이 머신의 베타 SDK 회피용).
- 자체 서명 인증서 NAS: `CHAT_VIEWER_INSECURE=1 pnpm tauri dev`
- 세션(sid/SynoToken)과 OTP 기기 토큰 저장 위치
  - 개발 빌드(`tauri dev`): 앱 데이터 폴더(`~/Library/Application Support/co.duo.chat-viewer/`)의 0600 파일. 개발 바이너리는 빌드마다 서명이 바뀌어 macOS 키체인이 매번 접근을 묻기 때문.
  - 배포 빌드(`tauri build`): OS 자격 증명 저장소(macOS 키체인, Windows 자격 증명 관리자, Linux Secret Service). macOS는 `bundle.macOS.signingIdentity`로 서명하면 최초 1회만 묻는다.

## 구조

```
src-tauri/src/   api.rs(REST) auth.rs(로그인) session.rs(키체인) socket.rs(Engine.IO v3) lib.rs(커맨드)
src/api/         Tauri invoke 래퍼와 타입
src/store/       zustand: session, chat(채널/사용자/메시지)
src/realtime/    Rust 소켓 이벤트 → 스토어 반영
src/components/  Sidebar, MessageList(가상 스크롤), MessageItem, Composer, LoginForm
docs/api.md      캡처한 API 명세
```

## 라이선스

[Apache License 2.0](LICENSE). 누구나 무료로 쓰고 고치고 다시 배포할 수 있습니다. 이 라이선스는 상표권을 허락하지 않으므로 이름("Chat Viewer")과 앱 아이콘을 그대로 쓰는 별도 배포는 허용되지 않습니다.

Chat Viewer는 Synology Chat의 비공식 데스크톱 클라이언트이며 Synology Inc.와 관련이 없습니다. Synology, DSM, Synology Chat은 Synology Inc.의 상표입니다.
