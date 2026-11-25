/**
 * Keyboard reference shown on the 정보 page. Keys are written with "Mod" (⌘ on macOS, Ctrl elsewhere), "Alt" (⌥)
 * and "Shift" (⇧); `markup` is the typed alternative where one exists. Keep this in step with the handlers in
 * Main.tsx (global), useSynoEditor.ts / extensions.ts (editor), SearchPalette.tsx and ImageViewer.tsx.
 */
export interface ShortcutRow {
  /** Alternatives, each a "+"-joined chord, e.g. "Mod+Shift+B". Empty when the row is markup only. */
  keys: string[];
  label: string;
  /** Typed markup that does the same thing, shown as code. */
  markup?: string;
  note?: string;
}

export const SHORTCUT_GROUPS: { title: string; rows: ShortcutRow[] }[] = [
  { title: "보내기", rows: [
    { keys: ["Enter"], label: "전송", note: "터치 화면은 Enter 줄바꿈 · 보내기 버튼 전송" },
    { keys: ["Shift+Enter"], label: "줄바꿈", note: "인용·목록 안에서는 새 줄·새 항목, 빈 항목에서 한 번 더 누르면 벗어남" },
    { keys: ["Enter", "Mod+Enter"], label: "코드 블록 안에서 전송", note: "코드 블록 안의 Enter는 줄바꿈 · 빈 줄에서 Enter 또는 Mod+Enter로 전송" },
    { keys: ["↑"], label: "내 마지막 메시지 편집", note: "입력창이 비어 있을 때" },
  ] },
  { title: "서식 (입력창)", rows: [
    { keys: ["Mod+B"], label: "굵게", markup: "*굵게*" },
    { keys: ["Mod+I"], label: "기울임", markup: "_기울임_" },
    { keys: ["Mod+Shift+S"], label: "취소선", markup: "~취소선~" },
    { keys: ["Mod+E"], label: "인라인 코드", markup: "`코드`" },
    { keys: ["Mod+Alt+C"], label: "코드 블록", markup: "```" },
    { keys: ["Mod+Shift+B"], label: "인용", markup: "> " },
    { keys: [], label: "목록", markup: "- " , note: "줄 처음에 - 또는 * 와 공백" },
  ] },
  { title: "입력창 커서", rows: [
    { keys: ["Home", "End"], label: "줄의 처음 · 끝으로", note: "Shift를 더하면 선택" },
    { keys: ["Mod+Home", "Mod+End"], label: "글 전체의 처음 · 끝으로", note: "Shift를 더하면 선택" },
  ] },
  { title: "찾기 · 보기", rows: [
    { keys: ["Mod+K"], label: "검색 팔레트", note: "Enter 검색 실행 · ↑↓로 결과를 고른 뒤 Enter로 이동 · Esc 닫기" },
    { keys: ["Mod+I"], label: "채널 정보", note: "입력창 밖에서 · 채널명 클릭도 같음" },
    { keys: ["Mod+Shift+M"], label: "멤버" },
    { keys: ["Mod+Shift+B"], label: "게시판(고정·파일·링크)", note: "입력창 밖에서" },
    { keys: ["Mod+\\"], label: "사이드바 접기 · 펼치기" },
    { keys: ["Esc"], label: "패널 · 검색 · 뷰어 닫기" },
  ] },
  { title: "이미지 뷰어", rows: [
    { keys: ["←", "→"], label: "채널의 이전 · 다음 이미지", note: "↑ ↓도 같음 · 로드된 메시지가 끝나면 이전·다음 페이지를 이어서 받음" },
  ] },
  { title: "입력 도우미", rows: [
    { keys: [], label: "멘션", markup: "@이름" },
    { keys: [], label: "이모지", markup: ":이름" , note: "두 글자부터 자동완성" },
  ] },
];

/** Things worth knowing that are not key presses. */
export const TIPS: [string, string][] = [
  ["채널 정보 열기", "채널명 클릭 또는 헤더의 정보 버튼 · 대화 영역·입력창 클릭, Esc, 채널 전환으로 닫힘 · 글자를 치는 것만으로는 닫히지 않음"],
  ["사진 묶음", "같은 사람이 2분 안에 연속으로 올린 사진은 격자로 묶여 보임 · 타일 클릭으로 크게, 호버로 다운로드·삭제"],
  ["읽음 표시", "내 메시지 옆 숫자 = 아직 안 읽은 사람 수(1:1은 1) · 모두 읽으면 사라짐 · 설정 → 알림에서 끄기 · NAS 설정 '읽음 상태'가 켜져 있어야 동작"],
  ["채팅 복사", "메시지를 드래그해 복사하면 보낸 사람·시간과 함께 정돈되어 복사됨"],
  ["설정 동기화", "정렬·그룹·고정·숨김·테마는 내 공간의 '자동 관리' 스니펫 하나에 저장되어 다른 PC에서도 복원됨 · 그 메시지는 지우지 않기"],
];
