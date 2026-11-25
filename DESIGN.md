---
name: Chat Viewer
description: A light desktop client for Synology Chat; quiet tonal surfaces, one point colour, text that always reads.
colors:
  accent-blue: "#3f7cd9"
  accent-blue-night: "#7fa6e6"
  paper: "#ffffff"
  paper-muted: "#f4f5f9"
  paper-line: "#e3e6ee"
  ink: "#181b25"
  ink-muted: "#5b6272"
  rail-day: "#222733"
  rail-day-ink: "#c3c8d2"
  night-rail: "#101318"
  night-page: "#222632"
  night-card: "#2a2f3f"
  night-line: "#373e53"
  night-line-strong: "#3f475f"
  night-ink: "#eceef4"
  night-ink-muted: "#a3a9ba"
  mention-wash: "#fdf0c4"
  mention-wash-night: "#4d4116"
  alert-red: "#ef4444"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Pretendard, 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  message:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Pretendard, 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  channel-row:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Pretendard, 'Segoe UI', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Pretendard, 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  code:
    fontFamily: "'SF Mono', Menlo, Consolas, monospace"
    fontSize: "12.5px"
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  popover: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  sidebar-gutter: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  channel-row-selected:
    backgroundColor: "{colors.accent-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  popover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.popover}"
---

# Design System: Chat Viewer

## Overview

**Creative North Star: "The Light Mailbox"**

A mailbox you open dozens of times a day should weigh nothing: it opens at once, the unread things are easy to spot, and everything else keeps quiet. Chat Viewer treats the conversation as the content and the interface as the mailbox around it. Surfaces are tonal layers rather than boxes, one point colour marks what is selected or actionable, and nothing decorative ever sits on top of words.

Density is that of a working tool: 13–14px type, 6px corners, thin 1px lines, small rows. Personalisation is part of the identity, not an afterthought: the user chooses the theme, brightness, saturation and a subtle surface grain, and every one of those choices flows through the same few variables, so hover colours, selection and borders follow the chosen point colour on their own.

**Key Characteristics:**
- Tonal layering instead of shadows: sidebar, chat, card and line are four steps of one hue.
- One point colour per theme; it fills the selected channel and the primary action, tints hovers, and nothing else.
- Light and dark are designed separately, not inverted. The sidebar is always the darkest or the most distinct layer.
- Text contrast is a hard requirement in every theme (see the Ink Rule).
- Compact first: the same layout shrinks to a single column without a second design.

## Colors

A cool blue-grey family with a single saturated accent. All values below are the default theme ("기본"); the other presets shift the hue and saturation of the same lightness ramp.

### Primary
- **Chat Blue** (#3f7cd9 light, #7fa6e6 on dark): the point colour. Fills the selected channel and the primary button, tints hover and focus states, colours links and the selection of tabs. Each theme has its own accent (blue, indigo, violet, pink, red, orange, amber, green, teal, slate), and the accent keeps its lightness while the saturation slider acts on it.

### Neutral
- **Paper** (#ffffff): the light chat column, inputs, popovers.
- **Paper Muted** (#f4f5f9): code blocks, cards, the composer toolbar zone.
- **Paper Line** (#e3e6ee): 1px dividers and field borders on light.
- **Ink** (#181b25): body text on light.
- **Ink Muted** (#5b6272): timestamps, secondary labels on light (contrast above 6:1).
- **Day Rail** (#222733) with **Rail Ink** (#c3c8d2): the sidebar on light themes. Light-sidebar presets (Graphite) flip to dark ink automatically.
- **Night Rail** (#101318): the sidebar on dark; the deepest layer.
- **Night Page** (#222632): the chat column on dark, about 8 lightness points above the rail.
- **Night Card** (#2a2f3f): code blocks, composer surface, muted fills on dark.
- **Night Line** (#373e53) and **Night Line Strong** (#3f475f): dividers; the stronger one is the sidebar edge.
- **Night Ink** (#eceef4) and **Night Ink Muted** (#a3a9ba): text on dark.

### Signal
- **Mention Wash** (#fdf0c4 light, #4d4116 dark): background of @mentions inside messages.
- **Alert Red** (#ef4444): unread-mention badges and destructive actions only.

### Named Rules
**The One Voice Rule.** The accent appears on the selected channel, the primary action, links and focus. Never on large backgrounds, never as decoration. Hover is the accent mixed into the surface at about 9% (chat) or 16% (sidebar).

**The Ink Rule.** Text on the sidebar uses a variable that flips with the sidebar's lightness; no component hard-codes white. White is allowed only on coloured fills (avatars, red badges, the image viewer).

**The Four Steps Rule.** On dark, the surface ramp is fixed in lightness (rail 8%, page 16.5%, card 20.5%, line 27%) and only hue and saturation come from the theme. Brightness moves the whole ramp but keeps the gaps.

## Typography

**Body Font:** the system stack (-apple-system, Apple SD Gothic Neo, Pretendard, Segoe UI).
**Mono Font:** SF Mono, Menlo, Consolas.

**Character:** native and unremarkable on purpose; Korean text is set in the platform's own gothic so it renders crisply at 13px. Hierarchy comes from weight and tone, not from size jumps.

### Hierarchy
- **Message** (400, 13px, 1.45): the content; sender name is 600 at the same size.
- **Body** (400, 14px): dialogs, settings, forms.
- **Channel row** (500, 13.5px): sidebar rows; unread rows go 600 and take the full ink colour.
- **Label** (400, 11px): timestamps, counters, hints, in the muted ink.
- **Code** (400, 12.5px mono, 1.5): inline code and code blocks.

Font size is a user setting (90% to 125%) applied as a whole-page zoom, so sizes are never overridden per component.

### Named Rules
**The Muted Is Still Readable Rule.** Secondary text never drops below 4.5:1 against its surface; "muted" means quieter, not faint.

## Layout

Two columns on desktop: the sidebar (264px wide, 84px as a rail, collapsible with ⌘\) and the chat column. A third panel (members or channel info, 380px) opens beside the chat and closes when the conversation is clicked. Below 720px the app becomes one column with a back button; the sidebar fills the width and the chat is a separate screen. A second window can open another channel at the same size.

Spacing is a 4px rhythm: rows use 6px vertical and 12px horizontal padding, the sidebar gutter is 16px, message gaps 12–16px.

## Elevation & Depth

Depth is tonal, not shadowed. The sidebar sits on the darkest step, the chat on the next, cards and code on the next, with 1px lines between (the sidebar edge is drawn as an inset 1px line in the stronger line colour). Surfaces do not cast shadows onto neighbours.

### Shadow Vocabulary
- **Floating menu** (`box-shadow: 0 10px 30px rgba(0,0,0,.18)`): popovers, menus and dialogs only, the things that actually float above the layout.

### Named Rules
**The No Bleed Rule.** Nothing casts a shadow across the sidebar/chat boundary. The boundary is a colour step plus one line.

**The Grain Between Rule.** The optional grain texture is drawn between a region's background and its content, tonal to that region, with separate strengths for the sidebar (default 70%) and the chat (default 40%). It never covers text.

## Shapes

Gently rounded: 6px for buttons, fields and rows; 8px for avatars and code blocks; 10px for popovers; 12px for folded rail folders. Borders are always 1px. Selection is a filled rounded row, never an edge stripe.

## Components

### Buttons
- **Shape:** 6px corners, 13px type, padding 6px × 14px.
- **Primary:** accent fill, text in the accent's foreground colour; one per dialog.
- **Ghost:** transparent with a 1px line, hover is the accent-tinted surface.
- **Danger:** red outline and red text, light red wash on hover.

### Fields
- **Style:** page-colour fill, 1px line, 6px corners, 13.5px text.
- **Focus:** border becomes the accent plus a 20% accent ring.

### Channel rows (sidebar)
- **Default:** rail ink at normal weight; hover is the accent mixed into the rail at 16%.
- **Unread:** full ink, weight 600, with a count badge in red (mentions) or a dot (muted channels).
- **Selected:** solid accent fill with the accent's foreground text; count badges invert to the foreground colour.
- **Rail (collapsed):** 44px square tiles with the same selected fill.

### Messages
- Avatar 36px at 8px radius, sender in 600, timestamp in muted ink. Hover reveals an action bar; code blocks sit on the card colour with an 8px radius and a copy button; quotes use a 3px left rule in the accent at 55%.

### Popovers and dialogs
- Page colour, 1px line, 10px radius, the floating shadow above; dialogs inherit the same chrome.

### Theme picker
- Cards that preview each theme's actual sidebar, page and accent colours, computed by the same function that applies the theme.

## Do's and Don'ts

### Do:
- **Do** express hover, selection and focus through the accent variable so a theme change recolours them all.
- **Do** use the sidebar ink variable for any text or icon on the sidebar so light-sidebar themes stay readable.
- **Do** keep the surface ramp steps (about 8 lightness points between rail and page on dark).
- **Do** check every new screen in light, dark and a light-sidebar theme (Graphite) before shipping.
- **Do** keep text effects and textures behind content.

### Don't:
- **Don't** add shadows that fall from the sidebar onto the chat or between cards.
- **Don't** mark selection with a coloured edge stripe or a tinted wash; the filled accent row is the signal.
- **Don't** hard-code white or black text on theme-dependent surfaces.
- **Don't** use colour washes, gradients or rainbow textures as backgrounds; patterns only, tonal to the surface.
- **Don't** use emoji as icons; lucide icons at 16–20px with the surrounding text colour.
