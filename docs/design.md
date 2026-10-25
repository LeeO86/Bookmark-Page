# Portal design

Bookmark-Page is a start page. The question on the screen is “where do you want to go?”. People recognise a device by its icon and click. Editing is rare. It is not a status dashboard: no status column, no latency, no metrics. Check latency stays in Prometheus and on the icon tooltip.

This brief replaces the round-2 layout. The round-2 behaviour below stays unless a section here changes it.

The reference is the Linkwarden dashboard (`docs/images/reference/linkwarden-home.jpeg`). Take its app shell: a narrow side nav, a large content area, neutral surfaces, rounded cards with a quiet border, favicon plus title plus a muted domain, small tags, and clear section headings. Do not copy its branding, preview photographs, statistics, or sample content.

## What stays from round 2

- Vivid Tailwind accent scales. Yellow is amber. Grey is slate. A custom hex keeps its chroma and hue and only changes lightness. Filled controls pick a step that reaches 4.5:1. The 500 step stays the swatch in the picker.
- Status changes only the favicon. Up is unchanged. Down is greyscale and dimmed, with a small red corner dot. Unknown keeps its colour and adds a small amber dot. No check shows nothing.
- `state:online`, `state:offline`, and `state:unknown` are query nodes, not stored tags. `state:unknown` requires a check. `is:unknown` still also matches an entry with no checks.
- Edit mode is for editors and admins, from the avatar menu or Shift+E, and lasts for the browser tab only (`sessionStorage` key `bp-edit-mode`). `e` opens the selected entry only while edit mode is on. A click still opens the primary link.
- The whole card or tile is one primary link. Secondary links, secret controls, and menus sit above it and do not navigate the card.
- Lucide icons are CSS masks in `currentColor`. Fetched and generated favicons sit on a light plate in both modes. Letter avatars use a colour derived from the name.
- Keyboard: `/` focuses the query, Escape clears it, arrows move the selection, Enter opens the primary link, Ctrl/Cmd+K opens the command palette.
- Admin keeps its own collapsible sidebar and the narrow-screen drawer toggle. Check intervals stay on each check.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [image]  Studio 1 Devices                         [avatar]  │  banner
│          If it beeps, it lives here.                         │
├────────────┬─────────────────────────────────────────────────┤
│ Views      │ [ search ...           ⌘K ] [▦ ▤ ☰] [Group ▾]  │  toolbar
│  All    40 │                                                 │
│  Control.. │  Control A                                  7   │
│  Audio..   │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│            │  │ card │ │ card │ │ card │ │ card │            │
│ Filters    │  └──────┘ └──────┘ └──────┘ └──────┘            │
│  ▸ Type    │                                                 │
│  ▸ Room    │  Machine room                              10   │
│  ▸ State   │  ...                                            │
├────────────┴─────────────────────────────────────────────────┤
│                                     Bookmark-Page v2.0.0     │
└──────────────────────────────────────────────────────────────┘
```

The banner scrolls away with the page. The sidebar and the toolbar stick to the top of the viewport after that. The content column is the part that grows. The page itself does not grow sideways.

### Banner

Full width, above the sidebar.

- Left: the title image, which is the existing logo setting. Shown as a rounded square, object-fit cover, about 72px on desktop and 48px below 768px, matching the title plus claim block. If no logo is set, the square is absent and the title sits at the left padding.
- Beside it: the site title, then the claim as the subtitle. The title is the largest text on the page.
- Right: an initials avatar (the first letter of the signed-in name) that opens the existing menu, or “Sign in”. Colour mode, edit mode, Admin, and sign-out stay in that menu. Nothing else is in the banner.
- The background setting (`gradient`, `tint`, `plain`) paints the banner only. The content area does not get the accent wash.
- Title and claim must reach 4.5:1 against both banner stops, for every preset, in light and dark. They use the same highlighted and accent-text tokens as round 2, measured against the banner rather than against the whole page.

Logo upload accepts PNG, JPEG, WebP, and SVG. SVG goes through the existing sanitiser before it is stored. The limit is 1 MB. The browser-tab icon stays PNG or WebP at 512 KB. JPEG and PNG are checked by their file signatures, the same way PNG and WebP already are.

### Sidebar

About 240px. A control at the bottom collapses it to icons (about 64px). The collapsed or expanded state is stored for a signed-in user and in the `bp-sidebar` cookie otherwise. The old filter slide-over and its `facets_open` preference go unused; the column stays so existing databases are not rebuilt.

Below 768px the sidebar is not on the page. A toolbar button opens it as a drawer. The button’s accessible name is “Open sidebar” or “Close sidebar”. The drawer overlays the content and does not widen the document.

**Views.** The saved tabs, as a vertical list. All comes first when it is visible, then global tabs, then personal tabs. Each row has the tab icon (or a simple bookmark glyph), the name, and a count. The active row is a rounded fill: a quiet accent tint and accent text, not a solid primary button. “+ Save as view” is the last row, quiet, and only for a signed-in user. It still creates a filter. Rename, delete, reorder, and “use current view” live in a `⋯` that appears on hover or keyboard focus, not as a permanent mark.

The count is how many entries match that view’s saved query under the caller’s visibility rules. It ignores the text currently typed in the search box, so the numbers stay put while someone is filtering. `GET /api/v1/filters` gains a `count` for each filter. The All count is the same kind of total with an empty saved query.

**Filters.** One collapsible group per namespace that is shown in the sidebar, including the virtual `state` group (Online, Offline, Unknown). Each value has the namespace colour dot, the display label, and a count. The selected value is highlighted. Click adds AND, Shift adds OR, Alt adds NOT, and the hover hint says so. “Clear filters” is shown only when the query bar is not empty, and it clears that bar. It does not change the selected view.

### Toolbar

Sticky, on the neutral content background.

- The query bar, with chips inside it and `⌘K`. `/` still focuses it. The command palette is this surface, not a second banner button.
- A segmented icon control, in this order: cards, tiles, list. The pressed icon is the mode that is actually rendered.
- The tile-size control is an icon beside that segment, shown only while tiles are active. It is not a “Regular tiles” label.
- A group menu: the namespaces, “No grouping”, then “Expand all” and “Collapse all”. The tab’s stored group is the default. A signed-in user’s choice is remembered per tab. Anonymous visitors keep it for the browser session.
- In edit mode, “New entry” sits in this toolbar. “Add link” stays available from the entry that is being edited.

### Footer

One line, small, at the end of the content column, aligned to the right: “Bookmark-Page v2.0.0”. The version comes from the application package version.

## Content

The content background is neutral, not themed. Light mode uses neutral 100. Dark mode uses neutral 950. Cards and the list sit on a lighter or more elevated surface (white in light mode, neutral 900 in dark mode) with a hairline border. A shadow appears on hover, not as a permanent drop shadow. Group headings and body text are measured against this neutral surface, not against the banner.

Sections follow the active group. The heading is the tag’s display label, with the count at the right and a chevron to collapse. `state` headings are Online, Offline, and Unknown. Entries with no value in that namespace stay under “Ungrouped”.

### Cards

Cards are the default, including All and a newly created view. A view can still store another default. The `view` query parameter still wins. The database column default stays `list` so old rows and old backups are unchanged. The demo views default to cards.

`repeat(auto-fill, minmax(260px, 1fr))`, 1rem gap.

- Favicon on its plate at 40px, with the status treatment.
- Title, up to two lines. It wraps on words. The full name is the tooltip, so a long name is not clipped in the middle of a word. Weight 500, size 0.95rem.
- Host under the title, 0.75rem monospace, muted.
- Description, two lines at most.
- The view’s selected fields as compact label and value rows. A field with no value is omitted. A secret that exists is shown masked, with reveal and copy.
- Secondary links as labelled icon buttons. Each target is at least 28px. The primary link is the card itself and is not repeated as a button.
- Up to three tags, then “+n”.

### Tiles

The same surface as a card. `repeat(auto-fill, minmax(140px, 1fr))`. Favicon 48px, name up to three lines underneath, secondary links as icons with a 28px target. The large size is an icon toggle: 56px favicon and `minmax(168px, 1fr)`. It is remembered with the user’s tile size. The old 80px tile is retired.

### List

The dense list stays: 36px rows, or 32px in compact density. One cell holds favicon, name, and host. Then links, description, field columns, and tags. Only a sorted column shows an arrow. There is no status column.

The tags cell shows as many whole badges as fit, then “+n”. It does not clip a badge through the middle of a word.

Below 768px the list stays a list. It scrolls inside its frame. The segmented control still shows list. The round-2 swap that rendered cards while the control said list is removed.

## Visual language

The neutral palette follows the accent unless an admin has chosen one after the preset.

| Accent                                                    | Neutral |
| --------------------------------------------------------- | ------- |
| Red, Yellow, Pink, and a custom hue from 330° through 70° | stone   |
| Green, Cyan, Blue, Grey, and any other custom hue         | slate   |

Choosing a preset sets that neutral. Changing the neutral control afterwards sticks until the next preset change. A red banner over blue-grey cards is the case this rule removes.

Accent is used for the active view, primary buttons, focus, and selected filters. It is not a page wash.

Tags are `UBadge` `variant="subtle"`. The badge text is the display label, or the value when there is no label. A colour dot carries the namespace. The tooltip is the full `namespace:value` query token. Tag text stays at 3:1 by black or white against the badge. The status dot stays at 3:1 against the icon plate.

Inter stays the variable face already loaded with `@nuxt/fonts`.

| Role            | Size              | Weight |
| --------------- | ----------------- | ------ |
| Banner title    | 2.25rem           | 600    |
| Claim           | 1rem              | 400    |
| Section heading | 1rem              | 600    |
| Card title      | 0.95rem           | 500    |
| Tile name       | 0.875rem          | 500    |
| Host            | 0.75rem monospace | 400    |
| Body            | 0.875rem          | 400    |
| Footer          | 0.75rem           | 400    |

Page padding is 1.5rem on desktop and 1rem below 768px. Grids use a 1rem gap.

A selection ring is `:focus-visible` only. Loading the page does not draw a ring around the first device. Arrow keys still move the selection and focus it.

Menus and popovers are fully opaque (`bg-default`), with a border and a shadow. Text on them meets 4.5:1. They do not use a translucent or blurred surface.

## Tag display labels

`label` on a tag is already the query token (`room:control-a`). That field stays, because the query bar, chips, and Ansible strings depend on it.

A new nullable `display_label` column stores the human name (`Control A`). The API adds `displayLabel`. Empty or missing means the UI falls back to `value`. Headings, facet rows, and badge text use `displayLabel ?? value`. Tooltips and queries keep the token.

- Migration adds the column. It does not rebuild the tags table and does not drop rows.
- `PATCH /api/v1/tags/{id}` accepts `{ displayLabel }` for an editor or admin. Omitting it leaves the stored label. Sending null clears it.
- Backup documents add optional `displayLabel`. Archives without it still restore.
- The namespaces admin page lists the values in that namespace and edits the display label there.
- Ansible entry `tags` still accept strings. A string item may also be `{ tag: "room:control-a", label: "Control A" }`. Attaching a string does not erase a label already stored. A new `tag` module is not required. The entry module documents the object form.

`state` values are not rows in `tags`. Their display names are fixed: Online, Offline, Unknown.

## Editing

Outside edit mode, cards and tiles show no pencil, no `⋯`, and no drag handle. Right-click and a long press still open the menu: Copy link, Open all links, and history for everyone, and Edit for an editor.

Inside edit mode, every card and tile shows the edit button, the `⋯` menu, and a drag handle. The handle is the drag source, so a click on the card still opens the link. The toolbar shows “New entry”. The edit banner stays.

## Demo data

`pnpm seed:demo` keeps the studio catalogue and adds:

- A display label for every room, type, and vendor value used by the seed (`control-a` becomes “Control A”, and the same kind of name for the others).
- A distinct sanitised SVG icon per vendor: a simple shape or initials in that vendor’s colour. No real brand logos. Most devices use their vendor icon. A few keep a Lucide icon, and a few keep no icon so the letter avatar still appears.
- The two public views default to cards, still grouped by room.
- A title image: a simple generated mark, stored as the logo, not a photograph and not a third-party logo.

## Screenshots

After implementation, replace `docs/images/ui/` with production-build shots of the demo data:

- cards, tiles, and list, in light and dark, for Blue and Red
- sidebar collapsed
- filters active (a selected facet and “Clear filters”)
- edit mode, with the edit control and drag handle visible
- grouping, using display labels
- the command palette
- 390px width with the sidebar drawer open
- one image with the Linkwarden reference and the Bookmark-Page cards view side by side

Shots come from the production build, not the Nuxt dev server.

## Approval

Approved on 2026-10-25. The layout in this brief is what the portal implements.
