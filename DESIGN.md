# GitPulse Design

## North Star

GitPulse should feel like a courtside analytics desk for code: dense, fast to
scan, and energetic without becoming decorative. The app is local-first and
technical, so the interface should stay work-focused: restrained panels, sharp
tables, clear controls, and strong orange moments for primary action.

The product surfaces Git history as game-style analytics. Use the sports
language for energy, not for clutter. The UI should help a maintainer compare
repositories, inspect code health, clean aliases, and export reports quickly.

## Palette

Use the app palette everywhere, including the GitHub Pages landing page.

| Token | Value | Use |
| --- | --- | --- |
| `surface` | `#0b1326` | App background and landing base |
| `surface-container-low` | `#131b2e` | Large sections and sidebars |
| `surface-container` | `#1a2236` | Cards, form controls, doc links |
| `surface-container-high` | `#222a3d` | Hover states and raised panels |
| `surface-container-highest` | `#2d3449` | Active rows and selected panels |
| `primary` | `#ffb599` | Highlights, icons, chart starts |
| `primary-container` | `#f26522` | Main orange, CTAs, chart ends |
| `on-primary` | `#1a0a00` | Text on orange buttons |
| `on-surface` | `#dae2fd` | Primary text |
| `on-surface-variant` | `#9ba5c0` | Secondary text |
| `tertiary` | `#4ae176` | Positive health movement |
| `error` | `#ffb4ab` | Errors and destructive warnings |

The landing page must not drift into teal, beige, or generic SaaS gradients.
The product preview should look like the app: navy panels, orange chart bars,
and pale blue text.

## App Icon

The icon direction is a basketball carrying a Git branch graph. It ties the
box-score metaphor to Git without adding text that becomes unreadable at small
sizes.

Source: `src-tauri/icons/gitpulse-basketball.svg`

Generated Tauri assets live in `src-tauri/icons/` and should be regenerated
from that SVG with:

```bash
pnpm tauri icon src-tauri/icons/gitpulse-basketball.svg --output src-tauri/icons
```

Keep the symbol high contrast: orange ball, dark navy app tile, white branch
nodes, and dark seam lines.

## Layout

- Use full-width page sections or unframed layouts. Cards are for repeated
  items, modals, and tool surfaces only.
- Keep card radius at `8px` unless an existing component already uses a pill
  button.
- Prefer tonal stacking over heavy borders. When a border is needed, use the
  ghost outline color at low opacity.
- Preserve data density. GitPulse is an operational tool, not a marketing
  dashboard.

## Components

- Primary buttons use the orange gradient from `primary` to
  `primary-container`, with `on-primary` text.
- Secondary buttons use a dark surface fill and a ghost outline.
- Destructive actions use the error palette, explicit explanatory copy, and a
  native confirmation dialog.
- Charts use orange for primary activity and green only for positive health or
  improvement signals.
- Tables and list rows should show selection with tonal background shifts or a
  narrow orange accent, not large bright blocks.

## Data Deletion UX

The Settings page exposes a destructive "Delete all my data" action. It should:

1. Explain that Git repositories on disk are not modified.
2. Ask for confirmation before invoking the backend.
3. Clear SQLite app data through the Tauri command.
4. Clear `localStorage` keys starting with `gitpulse.`.
5. Reset selected workspace/repository UI state.

This keeps the local-first promise visible and gives users a recoverable mental
model: GitPulse data can be reset without touching their repositories.

## Public Docs And Landing

The public landing page should mirror the app, not invent a separate brand.
It should show:

- The same navy/orange palette as the app.
- A product preview that resembles the desktop dashboard.
- Direct links to README, architecture, design, release process, changelog,
  contributing, security, and public releases.
- The unsigned macOS install command:

```bash
xattr -cr /Applications/GitPulse.app
```

Release docs must explain that current macOS builds are unsigned and that the
command clears macOS quarantine after the app is moved to `/Applications`.
