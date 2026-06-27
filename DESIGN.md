# Design

Visual system for SpeakCoach. Tokens live in `apps/web/src/app/globals.css`; Tailwind maps them in `apps/web/tailwind.config.ts`. Greyscale + white with **one** blue accent. No purple.

## Color

Color strategy: **Restrained** — tinted-neutral greys carry the surfaces; blue-600 is the single accent (≤10% of any screen), used only for primary actions, the current selection, key state indicators, and the one important word in a heading.

| Role | Token | Light | Use |
| --- | --- | --- | --- |
| Background | `--background` | `210 20% 98%` | App canvas — calm near-white cool grey |
| Card | `--card` | `0 0% 100%` | Pure white surfaces lifted off the canvas |
| Ink | `--foreground` | `222 47% 11%` | Primary text (near-black navy) |
| Muted ink | `--muted-foreground` | `215 18% 42%` | Secondary text — darkened to clear ≥4.5:1 |
| Primary | `--primary` | `217 91% 53%` | Blue-600 — the only accent |
| Secondary/Muted/Accent surface | `--secondary` `--muted` `--accent` | `220 16% 95%` | Neutral grey fills (not indigo) |
| Border | `--border` | `220 16% 90%` | Hairlines |
| Success / Warning / Destructive / Info | `--success` `--warning` `--destructive` `--info` | green / amber / red / blue | Standardized semantic states |

Dark mode mirrors these (`.dark`). **Contrast is non-negotiable:** body/secondary ≥4.5:1, large text ≥3:1. Never lighten muted text "for elegance."

Emphasis = the `<Accent>` component / `.text-accent` (solid blue, `font-medium`). **Gradient text is banned** — the legacy `.text-gradient-*` classes are now solid-colour aliases.

## Typography

- **In-app (product register): Manrope only.** One family carries headings, labels, buttons, body, data. Fixed rem scale (no fluid clamp in app UI), tight ~1.2 step ratio.
- **Landing (brand register): Fraunces** (`font-display`, optical-size axis) for display headings only, paired with Manrope body. Never use Fraunces on app UI labels/buttons/data.
- Prose line length 65–75ch; `text-wrap: balance` on h1–h3, `pretty` on long prose.
- Font features on `body`: `"cv11", "ss01", "ss03"`.

## Motion

Emil Kowalski curves, defined as CSS vars in `:root`:
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — entrances/exits (the default)
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` — on-screen movement
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` — drawers/sheets

Rules: in-app transitions 150–250ms; **never `transition: all`** (name properties); animate only `transform`/`opacity`; entrances start from `scale(0.95)+opacity`, **never `scale(0)`**; **no bounce/elastic**; pressables use `.press` (`scale(0.97)` on `:active`); popovers are origin-aware, modals stay centered. Motion conveys state, not decoration — no orchestrated page-load sequences in app UI. Every animation has a `@media (prefers-reduced-motion: reduce)` fallback.

## Components

Reuse the kit in `apps/web/src/components/ui/` (button, card, badge, input, dialog, page-header, stat-tile, section-card, skeleton, empty-state, rich-empty-state, progress-ring, count-up, activity-calendar, …). Every interactive element ships all states: default, hover, focus, active, disabled, loading, error. Skeletons for loading (not centered spinners); empty states teach the interface. Consistent affordances across screens — same button shape, same control vocabulary, same icon style (lucide).

## Bixy

The assistant orb is pure blue (`assistant-orb.tsx`, light→sky→blue-600→deep-blue gradient). It sits over a soft blurred blue glow (`.bixy-halo`) so it reads as a living, glowing presence. States: asleep, listening, speaking, loading.

## Layout

Flexbox for 1D, Grid for 2D. Responsive grids `repeat(auto-fit, minmax(280px, 1fr))`. Responsiveness is structural (collapsing nav, reflowed columns), not fluid type. Cards used only as the genuine best affordance; never nested. `--radius: 0.5rem`.
