# 설치 · 제거 안내

배포 파일은 `pnpm tauri build`로 만든다(`src-tauri/target/release/bundle/`). macOS는 `.dmg`, Windows는 `-setup.exe`(NSIS).
두 플랫폼 모두 코드 서명 인증서 없이 만든 빌드라 첫 실행 때 OS 경고가 한 번 나온다. 아래 순서대로 하면 된다.

## macOS

### 설치
1. `Chat Viewer_x.y.z_aarch64.dmg`(Apple Silicon) 또는 `_x64.dmg`(Intel)를 연다.
2. 창에 보이는 **Chat Viewer**를 **Applications** 폴더로 끌어 놓는다.
3. 처음 실행할 때 "확인되지 않은 개발자" 경고가 뜨면:
   - **방법 A** (권장): 앱을 **우클릭 → 열기**를 선택하고 다시 **열기**를 누른다. 이후에는 그냥 더블클릭으로 열린다.
   - **방법 B**: 시스템 설정 → **개인정보 보호 및 보안** → 맨 아래 "Chat Viewer이(가) 차단되었습니다" 옆의 **그래도 열기**.
   - **방법 C** (터미널): `xattr -d com.apple.quarantine "/Applications/Chat Viewer.app"`

   이 경고는 Apple Developer ID로 공증(notarize)하지 않은 앱이면 항상 나온다. 앱은 ad-hoc 서명이 되어 있어 "손상되었습니다"가 아니라 "열 수 없습니다"로 나오고 위 방법으로 열 수 있다.
4. 로그인하면 세션은 macOS 키체인에 저장된다. 처음 한 번 키체인 접근을 물어보면 **항상 허용**.

### 권한
- **알림**: 처음 알림이 올 때 macOS가 허용 여부를 묻는다. 놓쳤다면 앱의 **설정 → 알림 → "시스템 알림 설정 열기"** 버튼으로 바로 간다(시스템 설정 → 알림 → Chat Viewer).
- 그 외 권한(카메라, 마이크 등)은 쓰지 않는다.

### 제거
1. 앱을 종료한다.
2. `/Applications/Chat Viewer.app`을 휴지통으로.
3. 남는 데이터를 지우려면:
   ```sh
   rm -rf ~/Library/Application\ Support/co.duo.chat-viewer   # 로컬 검색 색인, 설정
   rm -rf ~/Library/Caches/co.duo.chat-viewer ~/Library/WebKit/co.duo.chat-viewer
   ```
   키체인 항목(`chat-viewer`)은 **키체인 접근** 앱에서 지운다.

## Windows

### 설치
1. `Chat Viewer_x.y.z_x64-setup.exe`를 실행한다.
2. SmartScreen이 "Windows의 PC 보호" 창을 띄우면 **추가 정보 → 실행**. (서명 인증서가 없는 설치 파일은 항상 이렇게 나온다.)
3. 설치 창에서 **설치**. 현재 사용자 전용으로 `%LOCALAPPDATA%\Programs\Chat Viewer`에 설치되며 관리자 권한이 필요 없다.
4. WebView2 런타임이 없는 PC(드문 경우)에서는 설치 중에 자동으로 받아 설치한다.

### 권한
- 알림은 Windows 알림 센터로 간다. 꺼져 있으면 앱의 **설정 → 알림 → "시스템 알림 설정 열기"**(설정 → 시스템 → 알림)에서 켠다.

### 제거
- **설정 → 앱 → 설치된 앱 → Chat Viewer → 제거** 또는 시작 메뉴 **Chat Viewer → Uninstall**.
- 제거 프로그램이 앱 파일과 함께 `%APPDATA%\co.duo.chat-viewer`(세션·색인·설정)와 `%LOCALAPPDATA%\co.duo.chat-viewer`(WebView2 캐시)를 모두 지운다. 자격 증명 관리자의 항목은 제거 시 함께 삭제된다.

## 업데이트 배포 (앱 내 자동 업데이트)

앱은 실행 8초 뒤와 6시간마다 `tauri.conf.json`의 `plugins.updater.endpoints`(현재 GitHub Releases의 `latest.json`)를 확인한다. 새 버전이 있으면 창 위에 "새 버전 x.y.z이 있습니다 → 업데이트 후 다시 시작" 띠가 뜨고, 프로필 메뉴 → 정보 · 업데이트에서 수동 확인도 된다.

1. 버전 올리기: `src-tauri/tauri.conf.json`과 `package.json`의 `version`. (0.2.0이 한 번 잘못 배포됐으므로 다음 버전은 0.2.1 이상이어야 그 PC들도 업데이트를 받는다.)
   변경 내역: `CHANGELOG.md`(전체)와 `src/lib/changelog.ts`(최근 3개 버전, 업데이트 팝업·정보 페이지용)에 같은 항목을 적는다. 배포 후 `CHANGELOG.md`를 `presiti/chat-viewer-releases` 저장소 루트에 그대로 올리고(`gh api -X PUT repos/presiti/chat-viewer-releases/contents/CHANGELOG.md`), 그 버전 항목을 GitHub 릴리스 노트에도 넣는다.
2. 서명 키로 빌드: 키는 `~/.tauri/chat-viewer.key`(비밀, 백업 필수; 잃으면 기존 설치본이 새 버전을 받지 못한다), 공개키는 `tauri.conf.json`의 `plugins.updater.pubkey`.
   ```sh
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/chat-viewer.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   pnpm tauri build                                                        # macOS: .app.tar.gz + .sig
   pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc   # Windows: -setup.exe + .sig (크로스 컴파일)
   ```
3. `scripts/make-latest-json.sh https://github.com/presiti/chat-viewer-releases/releases/download/vX.Y.Z` → `release/latest.json`과 업데이트 파일(.app.tar.gz, -setup.exe, .sig)이 `release/`에 모인다.
4. `release/`의 `latest.json`과 업데이트 파일을 endpoint 주소의 폴더에 올린다(NAS Web Station 정적 폴더, 또는 GitHub Releases). 설치 파일(DMG/EXE)은 신규 설치용으로 같이 올리면 된다.
5. 기존 사용자는 앱이 알아서 띠를 띄운다. 공증 없는 macOS 빌드는 업데이트 설치 뒤에도 첫 실행 경고가 다시 나올 수 있다.

endpoint를 바꾸려면 `tauri.conf.json`의 `plugins.updater.endpoints`를 고치고 다시 빌드한다(이미 배포된 앱은 예전 주소를 본다).

## 배포 파일 만들기

```sh
pnpm install
pnpm tauri build            # 실행한 OS용 번들 생성
```

- macOS에서는 `.app`과 `.dmg`가, Windows에서는 `-setup.exe`가 나온다. 서로 교차 빌드는 되지 않으므로 Windows 설치 파일은 Windows PC(또는 GitHub Actions, `.github/workflows/release.yml`)에서 만든다.
- 버전은 `src-tauri/tauri.conf.json`의 `version`과 `package.json`을 함께 올린다.
- 코드 서명을 붙이고 싶으면: macOS는 `bundle.macOS.signingIdentity`를 Developer ID로 바꾸고 `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` 환경 변수로 공증, Windows는 `bundle.windows.certificateThumbprint`. 그러면 위의 경고가 사라진다.
