# Theme · SOLSAT (web product)
Sources: /Users/poom/Documents/work/solsat/solsat-code/solsat-frontend @ 21024711 (read-only, code only; live site not opened, no screenshots). Files read: `src/styles/{theme.ts,palette.ts,paletteFactory.ts,themeRoles.ts,global-tokens.ts,tokens.css,kinetic.css,map-tokens.css,motion.css,brand.tokens.css}`, `src/app/fonts.ts`, `DESIGN.md`, `public/solsat-logo.svg`.
Note: `tokens.css` says it is generated from the repo's `DESIGN.md` (`bun run tokens:build`). Both agree on every value used below.

## Provenance
| Token | Value (light) | Value (dark) | Source | Confidence |
|---|---|---|---|---|
| color.bg (surfaceCanvas) | #FFFFFF | #000000 | themeRoles.ts:3,28 | code |
| color.surface (surfaceCard) | #F7F7F8 | #0B0B0C | themeRoles.ts:4,29 | code |
| color.border-control-dark alt (on-orbit-subtle) | n/a | #9A9B9D | tokens.css:51 | code |
| color.glass (lens-bg, border, blur) | n/a | rgba(0,0,0,.78), rgba(255,255,255,.18), blur 14 saturate 160 | tokens.css:169-172 | code |
| color.on-orbit-dim | n/a | #BDBDBF | tokens.css:20 | code |
| color.surface-subtle | #EDEDEE | #1A1A1C | themeRoles.ts:5,30 | code |
| color.text | #0B0B0C | #F5F5F5 | themeRoles.ts:6,31 | code |
| color.muted (textSecondary) | #5F6062 | #BDBDBF | themeRoles.ts:7,32 | code |
| color.text-disabled | #6B6C6E | rgba(245,245,245,.32) | themeRoles.ts:8,33 | code |
| color.border (borderSubtle) | #D0D0D2 | rgba(255,255,255,.12) | themeRoles.ts:9,34 | code |
| color.border-control | #5F6062 | #BDBDBF | themeRoles.ts:10,35 | code |
| color.primary (actionPrimary) | #FF5A1F | #FF5A1F | themeRoles.ts:12,37 | code |
| color.primary-hover | #E04A12 | #E04A12 | themeRoles.ts:13,38 | code |
| color.primary-ink (textOnAction) | #0B0B0C | #0B0B0C | themeRoles.ts:14,39 | code |
| color.accent (tertiary, orange safe for text) | #B93A0A | #FF7E4D (tertiary-bright) | tokens.css:5,7 | code |
| color.accent-deep (tertiary-deep) | #A8360A | #A8360A | tokens.css:6 | code |
| color.accent-wash | #FFE9DF | #2A1208 (surfaceSelected) | tokens.css:10; themeRoles.ts:18,42 | code |
| color.focus (focusRing) | #0B0B0C | #F5F5F5 | themeRoles.ts:20,44 | code |
| color.danger (errorText) | #BE1E2D | #FF8A95 | themeRoles.ts:21,45 | code |
| color.danger-surface | #F9D6D9 | #1A1A1C | themeRoles.ts:22,46 | code |
| color.success (positive) | #1B6B36 | #7FD39B | tokens.css:33,57 | code |
| color.success-surface | #E2EBD6 | #1A1A1C | themeRoles.ts:23,47 | code |
| color.info (sky) | #285A80 | #8EC1E6 | tokens.css:35,58 | code |
| color.info-surface | #D9E2E6 | #1A1A1C | themeRoles.ts:24,48 | code |
| color.warning-surface | #FFE9DF | #1A1A1C | themeRoles.ts:25,49 | code |
| color.orbit (dark panels, logo ground) | #000000 | #000000 | tokens.css:16 | code |
| color.flux ramp (marketing gradient) | #2A0F5C #8E1E6E #E8432E #FF9A1F #FFE45C | same | tokens.css:52-56 | code |
| font.body | Poppins (Latin), Prompt (Thai), system-ui | same | kinetic.css:11; fonts.ts:30,39 | code |
| font.display | Zen Dots (Latin), Kanit (Thai), Chakra Petch, Prompt | same | kinetic.css:6-8; fonts.ts:12,21 | code |
| font.numeric | Chakra Petch (Latin), Prompt (Thai) | same | kinetic.css:4; fonts.ts:3 | code |
| font.wordmark | Zen Dots, Chakra Petch | same | kinetic.css:9 | code |
| radius.xs/sm/md | 2 / 4 / 4 px | same | tokens.css:176-178 | code |
| radius.lg/xl | 8 / 8 px | same | tokens.css:179-180 | code |
| radius.pill | 4px (round = 999px separately) | same | tokens.css:181-182 | code |
| radius.card / panel / field | 20 / 24 / 12 px | same | tokens.css:183-187 | code |
| mui shape.borderRadius | 14px | same | theme.ts:12 | code |
| elevation.card, tile, paper-1, paper-2 | none | none | tokens.css:206-209 | code |
| elevation.paper-3 (floating) | 0 24px 48px -24px rgba(14,14,12,.45) | same | tokens.css:210 | code |
| elevation.lens (glass panel) | 0 18px 40px -18px rgba(0,0,0,.6) | same | tokens.css:174 | code |
| space | 4 8 16 24 32 48 64 96 128 | same | tokens.css:189-197 | code |
| tap-min | 44px | same | tokens.css:198 | code |
| motion.ease-out | cubic-bezier(.16,1,.3,1) | same | tokens.css:215 | code |
| motion.dur-1/2/3 | 120 / 240 / 400 ms | same | tokens.css:221-223 | code |
| motion.interactive | 160ms | same | DESIGN.md studio duration-interactive | code |
| type.body | 16px / 1.65, 400 | same | tokens.css:93-96 | code |
| type.body-sm | 15px / 1.65 | same | tokens.css:97-100 | code |
| type.label | 13px / 1.4, 500 | same | tokens.css:101-104 | code |
| type.h2 / h3 | clamp(20,.. ,28px) 600 / 17px 600 | same | tokens.css:81-88 | code |
| type.data | 16px 600, tnum, Chakra Petch | same | tokens.css:120-124 | code |
| type thai line-height | body-lg 1.7, h2 1.45, h3 1.5 | same | tokens.css (`:root:lang(th)` block) | code |

## Roles
| Role | Light | Dark |
|---|---|---|
| bg | #FFFFFF | #000000 |
| surface | #F7F7F8 | #0B0B0C |
| text | #0B0B0C | #F5F5F5 |
| muted | #5F6062 | #BDBDBF |
| border | #D0D0D2 (decorative), #5F6062 (controls) | rgba(255,255,255,.12), #BDBDBF |
| primary | #FF5A1F | #FF5A1F |
| primary-ink | #0B0B0C | #0B0B0C |
| accent | #B93A0A | #FF7E4D |
| success | #1B6B36 | #7FD39B |
| warning | #A8360A on #FFE9DF (derived from tertiary-deep) | #FFC2A8 (tertiary-soft) on #2A1208 (surfaceSelected, themeRoles.ts:42) |
| danger | #BE1E2D | #FF8A95 |
| focus | #0B0B0C | #F5F5F5 |

## Type · Radii · Elevation · Spacing · Motion
- Type: Poppins for Latin body (loaded 300 to 600), Prompt for Thai body (300 to 600, Thai subset only), Zen Dots for display and wordmark (weight 400 only, `font-synthesis-weight: none`), Kanit for Thai display (500, 600), Chakra Petch for numerals and kickers (500 to 700). Scale: body 16/1.65, small 15, label 13, h2 20 to 28, display up to 52 (site h1) with Thai line-heights 1.4 to 1.7.
- Radii: 2, 4, 8, 12 (field), 16 (tile), 18 (media), 20 (card), 24 (panel), 999. Controls and buttons are 4px.
- Elevation: flat. Hairline borders do the separating. One floating shadow (paper-3) and one glass shadow (lens) for panels over imagery.
- Spacing: 4, 8, 16, 24, 32, 48, 64, 96, 128 (4px base).
- Motion: ease-out `cubic-bezier(.16,1,.3,1)`, durations 120, 240, 400 ms, interactive 160 ms; everything collapses to 0.01ms under reduced motion.

## Contrast
| Pair | Ratio | AA text 4.5 | AA boundary 3.0 |
|---|---|---|---|
| text #0B0B0C on bg #FFFFFF | 19.67 | pass | pass |
| text on surface #F7F7F8 | 18.37 | pass | pass |
| muted #5F6062 on bg | 6.29 | pass | pass |
| muted on surface | 5.87 | pass | pass |
| primary-ink #0B0B0C on primary #FF5A1F | 6.30 | pass | pass |
| primary #FF5A1F on bg (graphics only) | 3.11 | FAIL | pass |
| primary #FF5A1F on surface | 2.91 | FAIL | FAIL |
| accent #B93A0A on bg | 5.71 | pass | pass |
| accent on surface | 5.34 | pass | pass |
| focus #0B0B0C on bg | 19.67 | pass | pass |
Dark (computed 2026-11-15, values from themeRoles.ts dark and tokens.css):
| Pair | Ratio |
|---|---|
| text #F5F5F5 on bg #000000 / surface #0B0B0C | 19.26 / 18.04 |
| muted #BDBDBF on bg / surface | 11.19 / 10.48 |
| border-control #9A9B9D on surface | 7.07 |
| accent #FF7E4D on bg / surface | 8.34 / 7.81 |
| primary-ink #0B0B0C on primary #FF5A1F | 6.30 |
| info #8EC1E6 on surface | 10.23 |
| danger #FF8A95 on surface | 8.73 |
Derived, not SOLSAT: success surface #12261A and danger surface #2A1114 (SOLSAT sets all dark status surfaces to #1A1A1C, which makes the three badges identical).

## Brand assets
- `public/solsat-logo.svg`: 1.2 KB, viewBox 1000x1000, mark only (two curved paths, no text), each filled with a white-to-black linear gradient. The white end disappears on white, so it is meant for dark grounds (orbit #000000). Clear space and minimum size are not stated in code (UNKNOWN).
- Wordmark: text set in Zen Dots (`--f-wordmark`), not an image file.
- Also in `public/`: favicon.ico, icon-192.png, icon-512.png, apple-touch-icon.png (SOLSAT app icons).

## Conflicts and unknowns
- Identity text vs code: the agent brief and older docs describe "Satellite Almanac" (warm cream, Fraunces, IBM Plex, sun orange). The current code is black, white and grey with orange, Poppins/Prompt/Zen Dots/Chakra Petch, flat. The code wins here.
- `DESIGN.md` description says "pill buttons"; `tokens.css:181` sets `--r-pill` to 4px. Used 4px.
- `--r-card` 20px and `--r-panel` 24px exist beside `--r-lg` 8px; the 20 to 24 values look like leftovers from the Almanac look. Not carried over.
- `actionPrimary #FF5A1F` is 3.11:1 on white, so it cannot be text. SOLSAT's own safe orange for text is `tertiary #B93A0A`.
- Dark `warning` pairing and disabled values: partly derived (see above). Light `textDisabled #6B6C6E`. Whether Chakra Petch supports `tnum` is UNKNOWN (not verified).
- Clear space and minimum size of the logo: UNKNOWN.

## Do not carry over
Zen Dots for body text, the flux gradient (marketing), noise texture, glow shadows (`--glow-hot`), kinetic and loop animation durations (2 to 46 s), MUI shape radius 14, studio dark-glass panels (the target app is light only), `--r-card` 20 and `--r-panel` 24.

## tokens.css
```css
:root {
  --color-bg: #FFFFFF;          --color-surface: #F7F7F8;
  --color-text: #0B0B0C;        --color-muted: #5F6062;
  --color-border: #D0D0D2;      --color-border-control: #5F6062;
  --color-primary: #FF5A1F;     --color-primary-ink: #0B0B0C;
  --color-accent: #B93A0A;      --color-focus: #0B0B0C;
  --color-success: #1B6B36;     --color-success-surface: #E2EBD6;
  --color-warning: #A8360A;     --color-warning-surface: #FFE9DF;
  --color-danger: #BE1E2D;      --color-danger-surface: #F9D6D9;
  --color-info: #285A80;        --color-orbit: #000000;
  --font-body: var(--font-poppins), var(--font-prompt), system-ui, sans-serif;
  --font-display: var(--font-zen-dots), var(--font-kanit), var(--font-chakra), sans-serif;
  --font-numeric: var(--font-chakra), var(--font-prompt), sans-serif;
  --radius-sm: 4px; --radius-lg: 8px; --radius-round: 999px;
  --space-1: 4px; --space-2: 8px; --space-4: 16px; --space-6: 24px; --space-8: 32px;
  --shadow-floating: 0 18px 40px -18px rgba(0, 0, 0, 0.6);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-1: 120ms; --duration-2: 240ms; --duration-interactive: 160ms;
}
[data-theme="dark"] {
  --color-bg: #000000; --color-surface: #0B0B0C; --color-text: #F5F5F5; --color-muted: #BDBDBF;
  --color-border: rgba(255, 255, 255, 0.12); --color-border-control: #9A9B9D;
  --color-accent: #FF7E4D; --color-focus: #F5F5F5; --color-danger: #FF8A95; --color-success: #7FD39B;
  --color-info: #8EC1E6; --color-warning: #FFC2A8; --color-warning-surface: #2A1208;
}
```
