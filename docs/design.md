# Portal design

Bookmark-Page is a start page. The question on the screen is “where do you want to go?”. It is not a dashboard and it does not display operational data. People open it many times a day, recognise a device by its icon, and click. Editing is rare.

This brief is the plan for the visual round. The behaviour from the previous round stays unless a section below changes it.

## Principles

- Links and favicons are the hero. Icons are large and click targets are the whole tile, card, or name.
- Using beats editing. Edit controls stay out of the way until edit mode is on.
- The page is calm and themed. Light mode uses light link surfaces. Dark mode uses dark link surfaces. The background carries a little of the accent so the page is not a blank admin screen.

Homarr is the reference for categories and app tiles. Grafana, status columns, latency, and metrics are out of the portal UI. Check latency remains available to Prometheus and to the icon tooltip, not as a column.

## Theme tokens

Presets use vivid Tailwind scales. The old V1 seeds (`#804040`, `#404080`, and the rest) were dark theme values, so Blue rendered as navy and Red as salmon. Those seeds are no longer the accent.

| Preset | Tailwind scale                |
| ------ | ----------------------------- |
| Red    | red                           |
| Yellow | amber                         |
| Pink   | pink                          |
| Green  | green                         |
| Cyan   | cyan                          |
| Blue   | blue                          |
| Grey   | slate                         |
| Custom | generated from the chosen hex |

For a named preset, `--ui-color-primary-50` … `950` are that Tailwind scale, copied as colour values. The hue is not mixed toward grey.

For a custom hex, the scale keeps the seed’s chroma and hue and only changes lightness. Contrast is solved by picking a step and a foreground, not by desaturating the accent.

Light mode uses primary 600 for filled controls when white text reaches 4.5:1, otherwise 700. Dark mode uses primary 400 for filled controls when the dark inverted text reaches 4.5:1, otherwise 300. Accent text on the page uses the same rule against the background stops. The 500 step stays the vivid swatch shown in the preset picker.

Neutral palettes stay slate, gray, zinc, neutral, and stone.

## Background

Admin setting `background`: `gradient` (default), `tint`, or `plain`.

- Gradient, light: primary 100 to neutral 50.
- Gradient, dark: primary 950 to neutral 950.
- Tint: a flat wash of the same light or dark accent stop.
- Plain: the normal surface background, with no accent wash.

Link surfaces sit on top of that wash: `bg-default` in both modes, a soft border, and a small shadow. Text on the wash (title, claim, group headings) and text on the surfaces (names, descriptions, field values) must both reach 4.5:1 for every preset in light and dark. Tag text stays at 3:1 by choosing black or white. The status dot stays at 3:1 against the icon plate.

## Type and spacing

Inter, loaded with `@nuxt/fonts`.

| Role          | Size              | Weight |
| ------------- | ----------------- | ------ |
| Page title    | 2.25rem           | 650    |
| Claim         | 1rem              | 400    |
| Group heading | 0.95rem           | 600    |
| Tile name     | 0.875rem          | 550    |
| Card name     | 1rem              | 600    |
| Host          | 0.75rem monospace | 400    |
| Body          | 0.875rem          | 400    |
| Footer        | 0.75rem           | 400    |

The page title is the largest text on the page. Page padding is 1.5rem on desktop and 1rem below 768px. Grids use a 1rem gap.

## Page structure

**Header.** Optional logo, then the site title from settings (for example “Studio 1 Devices”) and the claim underneath. The product name is not the title. On the right: the user avatar menu, or “Sign in”. Colour mode, edit mode, Admin, and sign-out live in that menu. Nothing else sits in the header.

**Footer.** Small text: “Bookmark-Page” and the version.

**Search.** A wide query bar under the header, centred. It shows `⌘K` and `/`. Typing filters immediately. Active terms are removable chips inside the bar. The command palette is the same query surface, not a second header button.

**Tabs.** A row of pills under the search bar. “+ Save as tab” is the last item, only for a signed-in user, and it is visually quiet.

**Filters.** Hidden by default. A “Filters” button beside the search bar opens a slide-over. Open or closed is remembered per signed-in user and in a cookie for everyone else. Facets show a namespace colour dot. The selected facet is highlighted. The hover hint remains: click adds AND, Shift adds OR, Alt adds NOT.

## Status

Status only changes the favicon.

- Up: the icon is unchanged.
- Down: the icon is greyscale and dimmed, with a small red dot on the corner.
- Unknown: a small amber dot, and the icon stays in colour.
- No check: no mark.

There is no status column, pill, or latency in tiles, cards, or the list. The icon tooltip may say “Offline since 14:32”.

`state` is a virtual tag namespace with values `online`, `offline`, and `unknown`. It appears as a facet and works in the query language (`state:offline`) beside the existing `is:up`, `is:down`, and `is:unknown`. It is not stored as a tag. Entries with no check are absent from those three values.

## Editing

Normal mode is the default for every role.

- No pencil buttons, no “New entry”, no drag handles.
- A click opens a link.
- `e` does nothing.
- Right-click, long-press, or the `⋯` that appears on hover opens a menu. Editors see “Edit”. Everyone sees “Copy link”, “Open all links”, and history.

Edit mode is for editors and admins. It is toggled from the avatar menu or with Shift+E, and it lasts for the browser tab only. While it is on:

- A banner says edit mode is on.
- Entries show edit and menu buttons.
- “New entry” and “Add link” are available.
- Drag-sort works.
- `e` opens the selected entry.

Admin is only in the avatar menu.

## Views

Tiles are the default, including the built-in All tab. A tab can still store its own default. The `view` query parameter still wins.

**Tiles.** `repeat(auto-fill, minmax(140px, 1fr))`. Favicon on a plate at 56–64px, name under it, two lines at most. The whole tile is the primary link. Secondary links are a row of small icons along the bottom, each its own link. A large-tile size uses `minmax(180px, 1fr)` and an 80px icon, for a wall screen or touch, and is remembered with the user’s other view preferences.

**Cards.** `repeat(auto-fill, minmax(280px, 1fr))`. Favicon 40–48px, name and host (small monospace, muted) beside it, description clamped to two lines, the tab’s selected fields, link buttons with labels, and up to three subtle tags plus “+n”. The whole card is the primary link. Secret reveal, copy, and secondary links stay real controls and do not navigate the card.

**List.** Dense rows, 36px, or 32px in compact density. One entry cell holds favicon, name, and host. Then link icon buttons with the primary link first, description, field columns, and tags. Sortable headers share one style. Only a sorted column shows an arrow. No status column.

**Every mode.** Grouping is a category heading: the namespace value, a count, and a collapse chevron. An admin sets the default group on the tab. Letter avatars use a colour derived from the name so a missing favicon is still recognisable. Tags are `UBadge` with `variant="subtle"`, the namespace colour on the badge, and the full `namespace:value` in the tooltip. Empty states and skeletons follow the active mode. Below 768px the list still falls back to cards.

Lucide icons render inline, or as a mask, in `currentColor`, so they follow the theme in dark mode. Fetched favicons sit on a light rounded plate in both modes, so a dark icon stays visible at night.

## Admin

The same collapsible sidebar on every admin page, with a drawer toggle on narrow screens. The extra link row on the settings page goes away. Check intervals stay on each check. There is no global check-defaults template.

## Demo data

`pnpm seed:demo` fills a local database with about 40 studio devices, the namespaces type, room, and vendor, library icons, one to four links, mixed reachability, a secret field, and two public tabs that default to tiles grouped by room. The site title is “Studio 1 Devices”.

## Screenshots

After implementation, replace `docs/images/ui/` with production-build shots of the demo data: tiles, cards, and list, in light and dark, for Blue and Red; the filter panel open; edit mode; grouping; the command palette; one admin page; and a 390px mobile view.
