# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primarily the maker (duo) and a few colleagues at a company that runs Synology Chat on its own NAS (DSM 7.3). They keep the app open through the working day, reading, searching and sending messages and files. Distribution is beta-style: Mac and Windows installers handed to a handful of colleagues, with fixes pushed as in-app updates.

## Product Purpose
Chat Viewer is a lightweight desktop client that replaces the official Synology Chat app, which loads the entire DSM desktop in a webview and feels slow. It calls only the Chat API directly. Success is that it opens fast, scrolls and switches channels without friction, and lets its users do everything they did in the official client without going back to it.

## Positioning
A personal-grade client built for its own users rather than for a general audience. Differentiators confirmed by the maker:
- Light and fast (Chat API only, no DSM webview).
- A local search index (SQLite FTS5) that matches partial words, file names, vote choices and link titles, where the server search only matches whole tokens.
- Personalisation: theme, brightness, saturation and texture; sidebar ordering, groups and hiding; message forwarding and tidy copy.
- A compact "small window" layout and an intended path to mobile (Android app; iOS as a web app).

## Operating Context
Desktop first (macOS and Windows, Tauri 2). Long sessions, many channels, frequent jumping between channels and searching history. Realtime updates arrive over a socket.io connection owned by the Rust side; all REST goes through Rust because the server sends no CORS headers. A second window can show a different channel. A dev build ("Chat Viewer Dev") runs separately from the release app.

## Capabilities and Constraints
- Synology compatibility is required: the app speaks the server's API and markup, and settings stored on the server (notification preferences, archive access) must stay compatible with the official client. App-only settings sync through a snippet in the user's own space (내 공간).
- Korean UI throughout. Icons come from lucide-react; emoji are not used as icons.
- Messages, files, threads, reactions, votes, pins, bookmarks, reminders, scheduled posts, archive viewing and forwarding are in scope; mobile-specific work (touch, long-press sheets, background sync) is planned but not built.
- Undecided: where a web (iOS) gateway would be hosted; whether the app is ever offered beyond the maker's circle.

## Evidence on Hand
README.md, docs/features.md, docs/api.md, docs/install.md and docs/backlog.md describe the feature set, captured API and install flow. There are no customers, testimonials or benchmarks, and none should be invented.

## Product Principles
1. Speed and calm over feature theatre: nothing should make the app feel heavier than the official client it replaces.
2. Reading comes first: message text stays legible in every theme; decoration never sits on top of words.
3. Respect the server: stay compatible with Synology's API, markup and stored settings.
4. Personal by design: the user's own arrangement (themes, sections, groups) is a feature, and defaults should already look considered.
5. One codebase, from a small window to mobile: layouts adapt rather than fork.

## Accessibility & Inclusion
Body-text contrast must hold in both light and dark modes and across all themes; the user explicitly named text legibility as a requirement. No other formal standard was stated.

## Secrets and sign-in
Passwords, session tokens and the updater signing key must never appear on screen, in logs or in output. Sign-in is performed by the user; automated work never enters credentials.
