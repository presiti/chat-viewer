# Synology Chat 내부 API 메모 (DSM 7.3, Chat 서버 기준)

이 문서는 공식 웹 클라이언트를 캡처해 정리한 것이다. Synology는 이 API를 공개 문서화하지 않으므로
서버 업데이트 시 버전/필드가 바뀔 수 있다. 민감한 값(토큰, 세션)은 모두 생략했다.

## 전송 형식

- `POST {host}/webapi/entry.cgi`
- Body: `application/x-www-form-urlencoded` — `api`, `method`, `version`, 나머지 파라미터.
  객체/배열 값은 JSON 문자열로, `null`은 문자열 `"null"`로 보낸다.
- 인증: 쿼리 `_sid=<sid>&SynoToken=<token>` (또는 쿠키 `id=<sid>`).
- 응답: `{"success": true, "data": {...}}` 또는 `{"success": false, "error": {"code": N}}`.
- 서버는 CORS 헤더를 내보내지 않는다. 브라우저 외 컨텍스트(이 앱은 Rust)에서 호출해야 한다.
- 전송 오류(`AppError::Http`)는 reqwest의 원인 체인(dns error / connection reset / timed out / certificate …)을 `종류: 원인` 형태로 풀어 쓰고, URL은 `_sid`/`SynoToken`이 들어 있으므로 메시지에서 뺀다(`error.rs`). 첫 채널 목록 로드가 실패하면 `Main.tsx`가 5초→30초 백오프로 재시도한다(소켓은 그 뒤에 붙으므로, 재시도 없이는 배너만 남고 앱이 멈춘다).

## 인증

| 단계 | API | 비고 |
|---|---|---|
| 1 | `SYNO.API.Auth login v6` | `account, passwd, format=sid, session=chat, enable_syno_token=yes` |
|   | OTP | `otp_code`, 기기 기억: `enable_device_token=yes, device_name` → 응답 `did`. 다음 로그인 때 `device_id=<did>` |
|   | 오류 | 400 잘못된 계정/비밀번호, 403 OTP 필요, 404 OTP 틀림, 406 OTP 강제 |
| 2 | `SYNO.Chat.User login v2` | Chat 세션 초기화. 응답 `{current_time, db_uuid, first_time, user:{user_id, is_admin}}` |
| - | `SYNO.API.Auth logout v6` | |

## 핵심 API

| 용도 | API | 파라미터 / 응답 |
|---|---|---|
| 채널 목록 | `SYNO.Chat.Channel list v5` | → `channels[]` (아래 필드) |
| 사용자 목록 | `SYNO.Chat.User list v3` | → `users[]` |
| 채널 멤버 | `SYNO.Chat.Channel.Member get v1` | `channel_id` → `{user_ids[], broken_user_ids[]}` |
| 채널 진입 | `SYNO.Chat.Channel enter v2` | `channel_id, conn_id` (공식 클라이언트는 Member.get과 compound로 묶음) |
| 읽음 처리 | `SYNO.Chat.Channel view v2` | `channel_id, last_view_at(ms), conn_id` |
| 메시지 목록 | `SYNO.Chat.Post list v5` | `channel_id, post_id|null, create_at|null, prev_count, next_count, thread_id|null` → `posts[]`. `post_id`를 주면 그 글을 **포함**해 이전 `prev_count`개 (중복 제거 필요) |
| 메시지 전송 | `SYNO.Chat.Post create v5` | `channel_id, type="normal", message, is_thread, thread_id, conn_id` (파일은 multipart `file`) → 생성된 post. **`is_thread`는 아예 보내지 않는다**: 값이 있으면(멀티파트 업로드에서는 문자열 "false"조차) "스레드 게시물"이 되어 서버가 채널에 `system_props.event="thread.create"` 시스템 글("게시물 생성")을 추가한다. 댓글은 `thread_id`만. 공식 클라이언트도 is_thread를 설정하지 않음 |
| 스레드 목록 | `SYNO.Chat.Post thread_list v5` | |
| 반응 | `SYNO.Chat.Post.Reaction set/delete v1` | |
| 검색 | `SYNO.Chat.Post search v5` | |
| 서버 시각 | `SYNO.Chat.Misc ntp v1` | → `{time}` (ms) |
| 아바타 | `SYNO.Chat.User.Avatar get v1` | GET 쿼리 `user_id, type=small|large, v=<avatar_version>` → 이미지 |
| 썸네일 | `SYNO.Chat.Post.File thumbnail v2` | `post_id, type` → 이미지 |
| 파일 | `SYNO.Chat.Post.File get v2` | `post_id` → 바이너리 |
| 묶음 호출 | `SYNO.Entry.Request request v1` | `compound=[{api,method,version,...}], mode="parallel"` → `{has_fail, result[]}` |

공식 클라이언트가 쓰는 전체 매핑(139개)은 `synochat-common.js`의 API 테이블에 있다.

## 레코드 필드

**Channel**: `channel_id, name, type(public|private|anonymous|chatbot|synobot), purpose, is_joined, is_star,
encrypted, channel_key_enc, unread, unread_comment, unread_mention, unread_mention_comment, unread_thread{},
last_post_at, last_view_at, last_view_comment_at, total_member_count, creator_id, create_at,
preferences{notification_desktop, notification_mobile, notification_mute}, subscribes[]`
- `anonymous`(DM)와 `chatbot` 채널은 `name`이 비어 있다. 멤버 목록으로 이름을 만든다.

**User**: `user_id, username, nickname, avatar_version, status(online|offline), type(human|bot), human_type(dsm),
deleted, is_disabled, dsm_uid, user_props`

**Post**: `post_id, channel_id, creator_id, create_at, update_at, delete_at, message, type(normal|file|system),
thread_id, comment_count, last_comment_at, reactions[{sticker_name, user_ids[]}], mentions[<user_id>],
hashtags[], file_props{name,size,type,is_image,image{width,height},is_snippet,is_voice_msg,snippet_preview},
url_props[{url,title,description,image,favicon,mime_type,hidden}], props{encrypted, forward{type}, safe_url},
is_star, is_sticky, last_pin_at`
- 멘션은 본문에 `@u:<user_id>` 형태로 들어간다.
- 시간은 모두 epoch ms.

## 실시간 (socket.io)

- Engine.IO **v3** (`EIO=3`), Socket.IO v2 프로토콜. 경로 `{host}/sc/socket.io/`.
- 핸드셰이크 쿼리: `SynoToken, client=browser, version_ui`. 세션은 쿠키 `id=<sid>`로 전달.
- 핑: 클라이언트가 `pingInterval`(25s)마다 `2` 전송, 서버가 `3` 응답.
- 서버 → 클라이언트 이벤트 (`42["<name>", data]`):

| 이벤트 | data |
|---|---|
| `init` | `{id: <conn_id>, ...}` — 이후 REST의 `conn_id`로 사용 |
| `post.create` | `{channel_id, data: <Post>}` |
| `post.update` | `<Post>` |
| `post.delete` | `{channel_id, post_id, thread_id?}` |
| `channel.join` / `channel.disjoin` / `channel.close` / `channel.hide_global` / `channel.unhide_global` | 채널 필드 + `user_id`, `user?` |
| `channel.typing_v2` | `{channel_id, user_id}` |
| `user.updatekey`, `channel.brokenuser`, `integration.online` | 암호화/통합 관련 |
| `broadcast` | `{type: "user.create"|"user.update", data}` |

- 클라이언트 → 서버: `client.initdone`(init 후), `client.user.activate`, `client.user.deactivate`,
  `client.user.typing`, `client.user.clear_typing`.

## 공식 클라이언트 구조 (참고)

- 데스크톱 앱은 Electron 17 + Vue 2 로그인 셸이고, 로그인 후 `{host}/?launchApp=SYNO.SDS.Chat.Application`을
  webview로 띄운다. 즉 DSM 데스크톱 프레임워크(ExtJS 3) 전체를 로드한다.
- Chat 앱 번들: `/webman/3rdparty/Chat/{synochat-common.js, synochat-app.js, webpack-bundle.js, style.css}`.
- DSM 없이 Chat만 띄우는 독립 진입점은 없다.

## 2차에서 추가로 확인한 API

### 서식 (Synology 마크업)
`*굵게*`, `_기울임_`, `~취소선~`, 줄 시작 `* 항목`(목록), `>한 줄 인용`, `>>>` 뒤 여러 줄 인용, `` `코드` ``, ```` ```블록``` ````, 멘션 `@u:<user_id>`, 이모지 `:shortname:`.

### 이모지·스티커
- shortname → unicode 매핑: `/webman/3rdparty/Chat/emojione-rulemap.js` (공개 정적 파일, 1,787개). `src/data/emoji.json`으로 변환해 사용.
- 커스텀 스티커: `Sticker list v2` → categories[{category_id, name, is_emoji, stickers[{sticker_id, name, keywords, support_skin}]}]. 이미지는 `style.css`의 CSS 스프라이트(`.sticker-<name>`, `images/sticker/{1x,2x}/<category>-<hash>.png`) → `src/data/stickers.json`.
- 반응: `Post.Reaction set/delete v1 {post_id, sticker_name}`; 레코드 `reactions[{sticker_name, user_ids[]}]`.

### 검색
`Post search v5 {keyword, in:[channel_id], from:[user_id], hashtag:[], post_type:[], has:[], after(ms), before(ms), offset, limit}` → `{search_results[], total, offset, limit}`.
다중 단어는 AND(순서 무관), 부분 문자열 일치. 특정 메시지 주변은 `Post list v5 {post_id, prev_count, next_count}`.

### 파일·스니펫
- 업로드: `Post create v5` multipart. 텍스트 파트 `api, method, version, channel_id, type=file, message, is_thread, thread_id?, conn_id` + 파일 파트 `file`(마지막). 쿼리 `_sid, SynoToken`.
- 스니펫은 `text/plain` 파일 업로드(파일명=제목). 응답 `file_props.is_snippet, snippet_preview, snippet_lines`. 전체 내용 `Post.Snippet get v1 {post_id}`, 편집 `Post.Snippet set v2 {post_id, file_name?, message?, snippet?}`.
- 다운로드 `Post.File get v2 {post_id}`, 썸네일 `Post.File thumbnail v2 {post_id, type}`.

### 예약 메시지
`Post.Schedule create v1 {channel_id, message, send_at(ms)}`, `set v1 {cronjob_id, message, send_at}`, `list v1`, `delete v1 {cronjob_id}`.

### 채널
- 즐겨찾기 `Channel star/unstar v2 {channel_id}`.
- 멤버: 채널 레코드 `members[]`(DM/봇 채널), `Channel.Member get v1 {channel_id}` → `{user_ids[]}`.
- 이름/목적 `Channel.Named set v1 {channel_id, name?, purpose?}`; 초대 `Channel.Named invite v1 {channel_id, user_ids[], channel_key_encs:[]}`; 강퇴 `Channel.Named kick v1 {channel_id, user_id}`; 나가기 `Channel leave v2 {channel_id, conn_id}`.
- 알림 `Channel.Preference get/set v3 {channel_id, notification_desktop, notification_mobile (all|mention_subscribe|mention|none), notification_mute}`.
- `synobot` 채널은 "내 공간"으로 표시. `chatbot` 채널은 `members`의 봇 사용자 닉네임으로 표시.

## 3차에서 추가로 확인한 API (게시판·내 컬렉션·투표)

- 검색에서 `in`을 **생략**하면 전체 채널 대상(빈 배열 `[]`은 "채널 없음"으로 해석돼 0건). 클라이언트는 비어 있으면 파라미터를 뺀다.
- 고정: `Post pin/unpin v5 {post_id}`; 목록 `Post search {in:[id], has:["pin"], sort_by:"last_pin_at"}`. 레코드 `is_sticky, last_pin_at`.
- 링크: `has:["url"]`; 북마크: `Post star/unstar v5 {post_id}`, 목록 `has:["star"]`(전체 채널). `has` 값 매핑: bookmark→`star`, `pin`, `reaction`, `url`.
- 편집/삭제: `Post set v8 {post_id, message, conn_id}`, `Post delete v8 {post_id, conn_id}`.
- 스레드 목록: `Post thread_list v5 {channel_id, offset, limit}` → `{search_results[], related_posts[], total}` (channel_id 필수, 없으면 401 "user not in channel").
- 리마인더: `Post.Reminder list v1 {channel_id}` → `{posts[]}` (channel_id 필수). 내 컬렉션은 즐겨찾기+최근 채널 40개를 compound로 모아 보여줌.
- 투표(type `vote`): `props.vote = {choices:[{id, text, count}], options:{multiple, anonymous, add_option, expire_at}, state}`.
  - `Post.Vote create v1 {channel_id, message, choices:[텍스트], options:{...}, conn_id}`, `vote v1 {post_id, choice_ids:[], conn_id}`(선택 집합 전체 전송),
    `get_choices v1 {post_id}` → `choices[{id,text,count,voters[]}]`, `close v1`, `delete v1`, `create_option v1 {post_id, text}`.
- 공식 UI 메뉴: 설정 · 구성원 · 게시판(고정/파일/URL) · 내 컬렉션(구독 스레드/북마크/리마인더/예약). 이 앱은 게시판·멤버·검색을 오른쪽 패널로, 설정은 모달로, 내 컬렉션은 사이드바 항목으로 배치.

## 검색 동작 정정 (실측)
`Post search v5`는 **단어(토큰) 완전 일치**다. "구내식당" 329건이지만 "구내식" 0건, "내식당" 0건. 띄어쓰기 없이 조사가 붙은 한국어("C동가실래요")는 "C동"으로 찾을 수 없다.
그래서 앱은 로컬 색인을 둔다: Rust `src-tauri/src/index.rs`의 SQLite FTS5(trigram) DB(`~/Library/Application Support/co.duo.chat-viewer/index_<host>.sqlite`).
`src/store/index.ts`가 앱 기동 후 백그라운드로 채널 히스토리를 200개씩 받아 색인하고(채널별 커서·완료 상태 저장), 실시간 이벤트와 채널 조회 결과도 바로 색인한다.
검색 패널은 로컬 색인(부분 문자열, 3글자 미만은 LIKE) 결과와 서버 결과를 합쳐 보여준다.

### 색인 스키마 v2
- `posts` 컬럼: `message`, `file_name`, `extra`(투표 선택지·링크 미리보기 제목/설명/URL·스니펫 미리보기·해시태그), `ext`(소문자 확장자). FTS5 테이블은 `(message, file_name, extra)`.
- 검색 대상(`scope`): `all`(세 컬럼 전부) · `message`(`{message extra}`) · `file`(`file_name`). FTS 컬럼 필터 구문 `{message extra} : "단어"`.
- 파일 필터: `kinds`(image/video/audio/pdf/doc/sheet/slide/archive/code/other, 확장자 집합은 `index.rs KIND_EXTS` = `src/lib/fileKinds.ts`)와 `exts`(직접 입력). 둘 중 하나라도 있으면 `type='file'`로 제한.
- v1 DB는 열 때 `PRAGMA user_version < 2`면 자동 마이그레이션(열 추가 → 트리거 없이 JSON에서 extra/ext 재계산 → FTS `rebuild`). 트리거가 있는 상태에서 rebuild 전에 UPDATE하면 FTS가 깨지므로 순서 주의.
- 게시판 "파일" 탭은 채널 색인이 완료됐으면 로컬 색인으로 종류/확장자 필터를 적용하고, 아니면 서버 결과를 클라이언트에서 거른다.

## 시스템 메시지 (`type: "system"`)
`message`는 비어 있고 `system_props.event`로 구분한다. 실측 이벤트: `channel.join/disjoin/kick/update/close`, `channel.archive.synobot`, `post.pin`, `thread.create`, `post.vote.update/close`, `bot.add/delete/reset/set_disabled`, `encrypt.enabled/disabled/notify`, `welcome.nativeapp/message`, (공식 코드상) `comment.create`.
필드: `trigger_user_id`(행위자), `effective_user_id`, `target_user_ids[]`, `post_id`(관련 글; pin/thread.create), `thread_id`, `channel_name`, `extra.update_info[{attr, old, new}]`(channel.update).
공식 클라이언트는 관련 글을 인용 박스로 보여주고 없으면 "이 메시지는 더 이상 존재하지 않습니다." — 앱은 `src/components/SystemMessage.tsx`에서 같은 방식으로 렌더링한다.

## 채널 숨기기 / 정렬 (실측)
- `SYNO.Chat.Channel hide v2 {channel_id}`: 사용자별 숨기기(공식 앱의 "숨기기"). `show`는 서버에 없다(오류 103). 공식 판정(`isHiddenChannel`): **`last_hide_at >= last_view_at`이고 안 읽은 메시지가 없으면 숨김**. 즉 채널을 열어(`Channel view v2`로 `last_view_at` 갱신) 보거나 새 메시지가 오면 다시 나타난다 → 앱의 "다시 표시"는 `Channel view`를 호출한다. `Channel list v5`에 `last_hide_at`, `hide_global_at` 포함(102채널 중 38개가 값 보유, 그중 일부만 현재 숨김).
- 정렬 설정은 서버에 없다(공식 앱은 `channel_order_time` 최근순 고정). 앱의 섹션별 정렬·맨 위 고정·앱 전용 숨김은 `localStorage chat-viewer:ui`의 `sidebar`에 저장(`src/lib/sidebarOrder.ts`, `src/store/ui.ts`).
- 사람 이름 검색: DM/봇 채널은 `members[]`, 공개/비공개 채널은 `Channel.Member get v1`을 compound로 한 번에 받아 `member_ids`에 캐시(`ensureAllMembers`). `channel.join/disjoin` 이벤트에서 캐시 무효화.

## 채널 가입/생성/보관, 프로필, 설정 저장 (실측)
- 미참여 공개 채널: `Channel list v5 {is_joined:false}`. 가입 `Channel.Named join v1 {channel_id, channel_key_enc:""}`, 탈퇴 `Named disjoin v1`, 생성 `Named create v1 {type, name, purpose, encrypted:false}` → `{channel_id,…}`; 이름이 이미 있으면 **420 kDuplicatedChannelName**(공개·비공개 통틀어 서버 전체에서 이름 유일, 내가 못 보는 채널 포함). 보관 `Channel archive v2 {channel_id}`(보관 목록 API는 없음; `is_archived` 파라미터는 무시됨). 관리자 비활성은 `hide_global_at>0`.
- 1:1 대화 생성: `Channel.Anonymous initiate v2 {user_ids:[상대id, 내id], encrypted:false, channel_key_encs:[]}` → 채널 레코드. **`user_ids`에는 나도 포함**해야 한다(공식 `initChannel([t, Session.getUserId()])`); 상대만 보내면 400. 상대가 Chat 사용자가 아닐 때도 **400 kNoSuchUser**. 공식 클라이언트는 `ACL.canInitiateAnonymous` = `human_type === "dsm"`인 사람에게만 허용한다(게스트·봇·삭제/비활성 계정 제외).
- 챗봇 대화: `Channel.Chatbot initiate v1 {user_id}` → type `chatbot` 채널(`creator_id`가 봇). `User.bot_type`은 synobot|chatbot|incoming|outgoing|slash|broadcast이며 chatbot만 대화 채널이 있다.
- 프로필: `User set v3 {nickname | is_always_offline | user_props{description,email,timezone,avatar_color}}`; 아바타는 같은 API에 multipart `avatar` 파일(Rust `upload_avatar`). 사진 제거는 `User set v3 {remove_avatar:true}`(공식 웹 클라이언트 `onAvatarDeleted`와 동일; `User.Avatar`에는 get만 있다). 공식 앱은 `avatar_version`이 0이면 이미지를 요청하지 않고 색 이니셜을 그린다.
- 사용자 `is_disabled`/`deleted`: 공식은 `isAvailable = !is_disabled && !deleted`로 회색 처리.
- 채널 알림: `Channel.Preference set v3 {channel_id, notification_desktop|notification_mobile: all|mention_subscribe|mention|none|by_admin_console, notification_mute}`.
- `User.Preference get/set v4`는 고정 키(`theme_style, notification_*, sidebar_pinning_unread, snooze, snooze_schedule_enable, calendar_enable, prefer_user_name_format`)만 받는다 → 앱 설정은 내 공간(synobot)의 스니펫 `chat-viewer-settings.json`에 저장(`src/store/sync.ts`; 생성은 파일 업로드, 갱신은 `Post.Snippet set v2`, 읽기는 `Post.Snippet get v1`, 탐색은 `Post search {in:[synobot], post_type:["file"]}`).
- 스니펫 판정은 서버가 **내용을 스니핑**해 결정한다: `{`로 시작하는 JSON은 `application/json`으로 분류되어 일반 첨부(`is_snippet:false`)가 되고 `Post.Snippet get/set`이 404를 낸다. 그래서 설정 파일은 `#` 주석 줄로 시작하는 `.txt`로 올린다. `Post.Snippet get v1`은 JSON 봉투가 아니라 **text/plain 원문**을 돌려준다(Rust `api::call`이 text/plain 응답을 문자열로 반환).

## 3차에서 추가로 확인한 API

- **파일 업로드 글의 소켓 순서**: `post.create`는 `{channel_id, data:{post_id, creator_id, create_at, thread_id, mentions}}`만 오는 **뼈대**이고(type·message·file_props 없음), 내용은 이어지는 `post.update`(Post 원본, **channel_id가 없을 수 있음**)로 온다. 반응(`reactions`) 변경도 `post.update`다. 클라이언트는 `post.update`의 channel_id가 없으면 로드된 페이지에서 post_id로 채널을 찾고(`channelOfPost`), 뼈대가 1초 안에 채워지지 않으면 `Post list {post_id, prev_count:0, next_count:0}`로 보충한다. 뼈대 판정은 채널 페이지와 로드된 스레드(댓글로 올린 파일) 모두에서 한다. 내가 올린 파일은 REST `Post create` 응답(전체 Post)도 `onPostCreate`로 들어오는데, 목록 병합(`sortPosts`)이 뼈대(type 없음)를 전체 복사본으로 덮어쓴다. 업로드 진행바는 `chat:post-created` 이벤트로 닫히며, 소켓 `post.update`/보충 조회로 뼈대가 채워질 때도 같은 이벤트를 쏜다. 안 읽음 카운트·읽음 처리의 "보고 있는 채널" 판정은 창 포커스 + 활성 채널 + 채널 화면(`ui.view === "channel"`)을 모두 요구한다(받은 편지함·내 컬렉션·관리 화면에서는 읽음 처리하지 않음).
- `User.Preference get v4` 실측 응답: `{preferences:{calendar_enable, notification_browser_active, notification_mute, notification_showmessage, prefer_user_name_format, sidebar_pinning_unread, snooze(ms 시각, 0=해제), snooze_schedule_enable, snooze_schedule_start/end(자정 기준 초; 설정 전엔 키 없음), theme_background, theme_style}}`. 공식 스누즈 프리셋 20·60·120·240·480·1440분, `setSnooze(m)` = `set {snooze: now + m*60*1000}`.
- 통합: `Webhook.Incoming list v1` → `{webhook_incomings:[{user_id, nickname, bot_type:"incoming", is_disabled, channel_id, creator_id, create_at, avatar_version, bot_props{is_system}}]}`, `Webhook.Outgoing list v1` → `{webhook_outgoings}`, `Webhook.Slash list v1` → `{webhook_slashs:[{…, slash_props{cmd, description, usage, url}}]}`. create/set/get도 v1로 존재(앱은 조회만). `Bot list`는 없음(103). `App list v2`는 DSM 앱 통합(Drive 등) 목록.
- 보관(실측, 공식 `synochat-archive.js` 기준): "보관"은 **내게 더 이상 살아있지 않은 채널의 기록**이다(채널 보관/폐쇄 `channel_closed`, 내가 나감 `leave_channel`, 요청 보관 `user_trigger`). `Archive list_name v1 {type: public|private|anonymous|chatbot}` → `{channel_names:[string]}`(anonymous는 멤버 id를 쉼표로 이은 이름), `Archive list v1 {type, channel_name}` → `{archives:[{archive_id, post_start, post_end, post_id_start, post_id_end, props:{channel, reason, trigger_user_id?}}]}`. `channel_name` 없이 부르면 빈 목록, `encrypted`는 101. 메시지는 `Post list v5 {channel_id, archive_id, post_id|null, create_at:null, prev_count, next_count, thread_id:null}`로 읽는다. 공식 "보관 뷰어"는 별도 DSM 앱 `/?launchApp=SYNO.SDS.Chat.Archive.Application`.
- 프로필 메뉴(공식 순서): 설정 · 암호화 · 통합 · 부재 중으로 설정(`User set v3 {is_always_offline:!cur}`) · 보관 뷰어 · 도움말 · 정보 · 로그아웃. 통합 항목은 `WEBHOOK_READ|WEBHOOK_CREATE` 권한, 보관 뷰어는 일반 사용자일 때만 표시.
- 시스템 알림은 `tauri-plugin-notification`(macOS `mac-notification-sys`). 기본 알림음은 sound 이름을 정확히 `NSUserNotificationDefaultSoundName`으로 줘야 울린다. dev 빌드는 Terminal의 번들 ID로 보내므로 알림 센터에 "Terminal"로 표시된다(배포 빌드는 앱 이름).

## 읽음 상태 (실측, 2026-11-19)
- `SYNO.Chat.Post get_read_status v6 {post_id}` → `{read_users, unread_users}` (사용자 레코드 배열; 클라이언트는 `user_id`로 정규화). 공식 클라이언트는 **내 글**이고 `Session.getSetting().allow_read_status`일 때만 "읽은 사람/읽지 않은 사람" 메뉴를 보여 준다.
- 설정값은 `SYNO.Chat.Admin.Setting get v3`(일반 사용자도 호출 가능, 공식 클라이언트가 초기화 때 호출) 응답의 `allow_read_status`. 같은 응답에 `allow_encryption`, `allow_edit_message`, `allow_drive_upload` 등 서버 전역 스위치가 함께 온다. 소켓 `setting.update`가 오면 다시 읽는다. **이 NAS는 현재 `allow_read_status: false`** → 관리자가 Synology Chat 설정에서 읽음 상태 표시를 켜야 기능이 동작한다.
- 다른 사람의 읽음을 알리는 소켓 push는 없다(`channel.view`는 내 다른 기기 동기화용). 그래서 활성 채널의 내 최신 글(최대 30개 후보, 틱당 8개, 동시 4개)을 10초마다 조회한다. 읽음은 멤버별 `last_view_at ≥ create_at`로 결정되므로 단조: 최신 내 글이 모두 읽혔으면 더 오래된 글은 호출 없이 읽음 처리. 연속 3회 실패하면 세션 동안 폴링 중단.
