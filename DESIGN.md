# Design System Inspired by Luma

## 1. Visual Theme & Atmosphere

Luma's design language feels like a polished event venue after the lights go down: a near-black canvas, soft glassy surfaces, bright photography, and a small number of celebratory color moments. The product is dark-mode-native on public pages, using `rgb(19,21,23)` as the deepest base and `#212325` / `#333537` as the surface ladder. Text, icons, event covers, and CTAs emerge from that darkness with high contrast but little visual noise.

The brand personality is "delightful utility." The landing page opens with an oversized product phone video and a rainbow-gradient phrase, while the discovery and pricing pages are much more operational: event rows, category tiles, pricing cards, checklists, and segmented controls. This balance matters. Luma can be playful at the brand moment, but the interface itself stays calm, scan-friendly, and compact.

The design system is built around Inter/system typography, rounded-but-not-cute geometry, faint borders, and translucent cards. Surfaces often use low-opacity white on dark backgrounds, `blur(16px)` backdrops, and subtle stacked shadows. Event artwork is the main visual content: square cover thumbnails, calendar avatars, colorful circular city icons, and category illustrations carry most of the color.

**Key Characteristics:**
- Dark-mode-native event platform aesthetic: `rgb(19,21,23)` base, `#212325` cards, `#333537` elevated panels
- Inter/system font stack with weight 500 as the dominant UI voice and weight 600 as the maximum emphasis
- Bright cranberry brand accent (`#f31a7c`) for Plus, brand links, and primary paid CTAs
- Rainbow brand moments: blue -> purple -> magenta -> pink -> coral -> orange gradients, used sparingly
- White primary CTAs on dark hero/login surfaces; cranberry CTAs for paid/upgrade actions
- 8px standard radius, 12px card radius, 16px large radius, 24px squircle/card-shell radius
- Event cover images and community avatars as primary content, not decoration
- Faint borders: `rgba(255,255,255,0.04)` to `rgba(255,255,255,0.16)` on dark surfaces
- Compact content rhythm: event rows, category grids, pricing checklist cards, and horizontally scrollable mobile rows
- Navigation is quiet: logo, current local time, "Explore Events" link, and pill-shaped sign-in button

## 2. Color Palette & Roles

### Core Dark Surfaces
- **Luma Black** (`rgb(19,21,23)` / `#131517`): The primary page background in dark mode. Used for landing, discover, pricing, and sign-in.
- **Card Black** (`#212325`): Default card and elevated surface in dark mode. Used for pricing cards, sign-in panel, category tiles, and content cards.
- **Panel Charcoal** (`#333537`): Higher-elevation panels, secondary buttons, tables, and selected segmented controls.
- **Slate Gray** (`#535557`): Hover fills, inactive button surfaces, and subdued panel separators.

### Light & Text
- **Primary White** (`#ffffff`): Main text on dark backgrounds and primary white CTA fill.
- **Soft White** (`#f7f8f9`): Near-white surface/text token; useful when pure white feels too sharp.
- **Secondary Text** (`rgba(255,255,255,0.79)` / approx `#d2d4d7`): Body copy, feature descriptions, pricing notes.
- **Tertiary Text** (`rgba(255,255,255,0.50)` / approx `#939597`): Metadata, event times, calendar descriptions, footer links.
- **Quaternary Text** (`rgba(255,255,255,0.32)` / approx `#737577`): Placeholder copy, low-priority labels, disabled-looking metadata.

### Brand & Accent
- **Cranberry** (`#f31a7c`): Primary brand accent in light tokens. Use for brand text, Plus CTAs, API links, active accents, and small emphasis.
- **Cranberry Dark Mode** (`#f98dbe` / `#f6539d`): Softer cranberry variants for dark-mode text and small labels.
- **Purple** (`#682fff`, dark mode `#b596ff`): Secondary brand/accent color, especially in gradients and category/event visuals.
- **Blue** (`#287eff`, dark mode `#76adff`): Link-like, chat-like, or discovery accent. Use cautiously outside gradients.
- **Orange** (`#f8712b`, dark mode `#fba67a`): Warm celebratory accent for gradient endpoints and event/category icon systems.

### Semantic Colors
- **Success Green** (`#3cbd2c`, dark mode `#77d86b`): Success states, check confirmations, accepted/registered indicators.
- **Warning Yellow** (`#d69712`, dark mode `#f2ca77`): Warning states and low-frequency status callouts.
- **Error Red** (`#ed2b32`, dark mode `#ff766d`): Validation errors, destructive states, failed payments.

### Gradients
- **Hero Text Gradient**: `radial-gradient(circle at 0 0, #099ef1 0%, #6863f8 18.82%, #d84ffa 32.6%, #f058c5 52.83%, #ff4f90 68.03%, #ff6558 87.66%, #ff891f 100%)`
- **Dark Brand Gradient**: `linear-gradient(-45deg, #d118ff 0%, #f32861 51.59%, #f8245d 51.6%, #ffbe19 100.05%)`
- **Footer/Create Gradient**: `linear-gradient(45deg, #6e2fe3, #0cabf7, #e27417, #1f6f05)`

Use gradients only for brand moments, hero text, footer calls to action, or small celebratory highlights. Do not turn whole cards or page backgrounds into rainbow surfaces.

## 3. Typography Rules

### Font Family
- **Primary**: `-apple-system, BlinkMacSystemFont, "Apple Color Emoji", Inter, Roboto, Segoe UI, Helvetica Neue, Arial, Noto Sans, sans-serif`
- **Mono**: `"SF Mono", Menlo, Monaco, Consolas, "Courier New", Courier, monospace`

Luma's typography is product-first. It uses system/Inter proportions, compact line heights, and a narrow weight range. The UI almost never gets heavier than 600, which keeps dense event and pricing information readable without becoming loud.

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Landing Hero | 64px | 500 | 1.03 | -1px | "Delightful events start here." Large, friendly, not ultra-bold |
| Landing Hero Mobile | 40px-52px | 500 | 1.10 | -0.5px | Preserve line breaks only when they help rhythm |
| Page Title | 32px | 600 | 1.15-1.20 | 0 | Discover/Pricing page titles |
| Card Price | 38px-44px | 400-500 | 1.10 | 0 | Pricing price numerals, intentionally lighter than headings |
| Section Title | 20px | 600 | 1.20 | 0 | "Popular Events", "Browse by Category", "Featured Calendars" |
| Small Section Title | 18px | 600 | 1.20 | 0 | Pricing card titles, add-on titles, modal titles |
| Event Title | 16px-18px | 500 | 1.30 | 0 | Event rows; clamp at 2 lines |
| Body | 16px | 400-500 | 1.50 | 0 | Descriptions, pricing explanations |
| UI Label | 14px | 500 | 1.30 | 0 | Nav, buttons, metadata labels |
| Metadata | 13px | 400-500 | 1.30 | 0 | Times, locations, event counts |
| Micro | 12px | 500-600 | 1.20 | 0 | Badges, "LIVE", save labels, table notes |
| Mono Time | 14px | 400-500 | 1.30 | 0 | Current time in nav; use tabular numerals |

### Principles
- **Weight 500 is the default voice.** Most labels, event titles, buttons, and nav items use medium weight; reserve 600 for section headings and key card labels.
- **Keep display type human.** The hero is large and tight, but not over-compressed or all-caps. It should feel inviting, not corporate.
- **Use muted text aggressively.** Times, counts, locations, descriptions, and legal notes should drop to tertiary color rather than competing with titles.
- **Clamp dense content.** Event names and calendar descriptions commonly clamp to 2 lines with ellipsis.
- **Use mono only for time, technical IDs, and code/API references.** Luma is not a developer brand; monospace should be rare.

## 4. Component Stylings

### Buttons

**White Primary CTA** ("Create Your First Event", "Get Started", "Continue with Email")
- Background: `#ffffff`
- Text: `#131517` or `#000000`
- Height: 44-52px depending on context
- Padding: 12px 24px
- Radius: 8px or full pill for nav-sized actions
- Weight: 500
- Hover: slightly dim or shift to `#f7f8f9`; keep the high-contrast white block

**Cranberry Primary CTA** ("Get Luma Plus")
- Background: `#f31a7c`
- Text: `#ffffff`
- Height: 44px
- Radius: 8px
- Hover/active: `#d5176d`
- Use only for paid upgrade, brand-critical, or high-commitment actions

**Dark Secondary Button**
- Background: `#333537` or `rgba(255,255,255,0.08)`
- Text: Secondary Text
- Radius: 8px or pill
- Use for OAuth sign-in, passkey, neutral toggles, and secondary actions

**Segmented Control**
- Outer background: `rgba(255,255,255,0.08)` or `#333537`
- Selected segment: `#535557` / `rgba(255,255,255,0.16)`
- Text: selected `#ffffff`, unselected tertiary
- Radius: 9999px
- Compact padding: 6px 14px

**Icon / Link Button**
- Background: transparent by default
- Icon/text color: tertiary; hover to primary
- Motion: arrow icons translate by 1px on hover
- Use for "Explore Events" external-link actions, footer icons, and card affordances

### Cards & Containers

**Content Card**
- Background: `rgba(255,255,255,0.04)` in dark mode; `rgba(255,255,255,0.80)` in light mode
- Border: `1px solid rgba(255,255,255,0.04)` default, `rgba(255,255,255,0.16)` hover
- Radius: 12px; large card shells may use 16px
- Backdrop: `blur(16px)` when sitting over gradients or imagery
- Hover: border brightens, shadow may softly deepen; avoid strong lift

**Event Row**
- Layout: 80px square image on left, text stack on right
- Cover radius: 8px
- Padding: 12px 16px
- Gap: 16px
- Divider: 1px `rgba(255,255,255,0.08)` offset after the image
- Hover: row background becomes `rgba(147,149,151,0.133)` or cover scales to `1.05`
- Title: 16-18px weight 500, 2-line clamp
- Metadata: time first, location second; use tertiary text

**Category Tile**
- Background: `#212325` / `rgba(255,255,255,0.04)`
- Border: faint 1px white-opacity border
- Radius: 12px
- Layout: icon at 40-48px, category name, event count
- Icon: colorful image or line icon with category tint; do not monochrome these
- Grid: `repeat(auto-fill, minmax(220px-240px, 1fr))`

**Calendar Card**
- Background: `#212325`
- Border: faint 1px white-opacity border
- Radius: 12px
- Padding: 16px
- Avatar: 48px square/circle, top-left
- Subscribe pill: top-right, dark secondary button
- Description: 2-line clamp in tertiary text

**Pricing Card**
- Background: `#212325`
- Border: `1px solid rgba(255,255,255,0.08)`
- Radius: 12px
- Padding: 24px
- Check icons: white circles/checks at 14-16px
- Dividers: faint horizontal rules between feature groups
- Free plan CTA: white; Plus plan CTA: cranberry

**Sign-In Panel**
- Width: ~430-460px
- Background: `#212325`
- Border: `1px solid rgba(255,255,255,0.16)`
- Radius: 24px
- Padding: 32px
- Top icon: circular gray well, 64px
- Inputs: dark background, subtle border, 8px radius
- Primary action: full-width white button

### Inputs & Forms

**Text Input**
- Background: `#131517` or `rgba(0,0,0,0.24)` on dark surfaces
- Border: `1px solid #333537`
- Text: Primary White
- Placeholder: tertiary text
- Radius: 8px
- Padding: 12px 14px
- Focus: white or brand-tinted outline; avoid thick glow

**Label Row**
- Label left, secondary action right ("Use Phone Number")
- Text size: 14px
- Weight: 500
- Icon: 14-16px, subdued

**Checklist Row**
- Icon left, text right, 10-12px gap
- Use check-circle icons for availability; do not use colored bullets

### Navigation

**Global Nav**
- Height: ~52px
- Background: transparent over page background; sticky pages may use backdrop blur
- Backdrop: `blur(16px)` when sticky
- Left: Luma star or wordmark, tertiary/soft white
- Right: local time, "Explore Events" external-link action, Sign In pill
- Text: 14px, weight 500, tertiary by default, primary on hover
- Sign In: dark translucent pill on public dark pages

**Footer**
- Top border: `1px solid rgba(255,255,255,0.08)`
- Logo + links left, app/social icons right
- Secondary links below on landing and pricing
- "Host your event with Luma" external-link copy may use a clipped gradient text treatment

### Image Treatment

- **Landing phone visual**: large phone video/mockup, 620px wide on desktop; it can dominate the right half of the hero.
- **Event covers**: square, 80px in event rows, 8px radius, `object-fit: cover`.
- **Calendar avatars**: 48px, rounded square/circle depending on source.
- **Category icons**: bright icon images on transparent/dark tiles; preserve their native color.
- **City icons**: 40px circular colored tokens with white pictograms.
- **Dark image adjustment**: public CSS brightens images in dark theme; use `filter: brightness(1.15-1.25)` only when assets feel too dim.

### Signature Components

**Rainbow Hero Word**
- Use only on the final phrase or one short word group.
- Clip the radial gradient to text with transparent fill.
- Surround it with otherwise white headline text.

**Discover Event Grid**
- Desktop: 2 columns of event rows, each row 80px cover + text.
- Mobile: horizontal scroll with 3 stacked rows per column; use scroll snap.
- Keep event content dense; discovery should feel like a curated local agenda.

**Pricing Matrix**
- Two large cards side by side, then add-on table and enterprise strip.
- Dark grid-pattern background is acceptable, but keep it low-contrast.
- Use cranberry only for the Plus plan and related links.

## 5. Layout Principles

### Spacing System
- **Base unit**: 4px with 8px as the practical rhythm
- **Common scale**: 4px, 6px, 8px, 10px, 12px, 16px, 18px, 20px, 24px, 32px, 48px, 64px
- **Container padding**: 16px mobile, 24px tablet, 32px desktop when inside card-heavy pages
- **Landing hero**: large vertical breathing room, 80vh minimum, but footer should remain discoverable after the hero
- **Card padding**: 16px for content cards, 24px for pricing/sign-in cards, 32px for large modal-like panels
- **Event row padding**: 12px 16px
- **Grid gap**: 16px standard; 12px on tablet/mobile

### Grid & Container
- **Default content width**: 820px for focused pages
- **Wide page width**: 960px
- **Extra-wide page width**: 1080px
- **Landing**: two-column hero with copy left and phone visual right; stack on mobile
- **Discover**: centered column with sections; event grid 2 columns, category/calendar grids auto-fill at 220-240px minimums
- **Pricing**: centered title, segmented control, two-column pricing cards, full-width add-on/enterprise rows below

### Whitespace Philosophy
- **Dark space is the canvas.** Empty black space is part of the atmosphere; do not fill every gap with borders or cards.
- **Density belongs inside sections.** Event rows, category tiles, pricing features, and city lists can be compact because section spacing separates them.
- **Brand moments need room.** The landing hero, pricing title, and sign-in panel should have calm negative space around them.
- **Let real content add color.** Event covers, avatars, category icons, and city icons should carry most chroma.

### Border Radius Scale
- **4px**: Micro elements, small labels, icon wells
- **8px**: Default controls, inputs, event covers, hover rows
- **12px**: Cards and category tiles
- **16px**: Large panels, pricing add-ons, enterprise strips
- **24px**: Modal/sign-in panel squircle feel
- **9999px**: Pills, segmented controls, nav sign-in button, subscribe buttons
- **50%**: Circular city icons, avatar fallbacks, icon-only actions

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Level 0 | `#131517` background, no shadow | Page canvas |
| Level 1 | `rgba(255,255,255,0.04)` surface + same-color border | Category tiles, low cards |
| Level 2 | `#212325` surface + `1px solid rgba(255,255,255,0.08)` | Pricing cards, sign-in panel, calendar cards |
| Level 3 | `#333537` surface or `rgba(255,255,255,0.16)` border | Tables, selected controls, elevated sub-panels |
| Hover | Border to `rgba(255,255,255,0.16)` + optional `0 28px 17px rgba(0,0,0,0.01)` stack | Hoverable content cards |
| Floating | `0 2px 3px rgba(0,0,0,.25), 0 4px 7px rgba(0,0,0,.30), 0 8px 14px rgba(0,0,0,.35), 0 17px 29px rgba(0,0,0,.40)` | Menus, popovers, overlays in dark mode |
| Modal | `0 0 0 1px var(--opacity-8), 0 3px 3px rgba(0,0,0,.1), 0 8px 7px rgba(0,0,0,.13), 0 17px 14px rgba(0,0,0,.17), 0 35px 29px rgba(0,0,0,.22), 0 -4px 4px rgba(0,0,0,.04) inset` | Dialogs, auth panels, command-like modals |

### Shadow Philosophy
Luma's depth is mostly surface and border based. The first read of hierarchy comes from dark luminance steps (`#131517` -> `#212325` -> `#333537`), then from faint borders. Shadows exist, but they are soft and low-contrast; they should never turn cards into floating paper. On top of image/gradient backgrounds, use `backdrop-filter: blur(16px)` and translucent fills to create glassy containment.

### Decorative Depth
- Landing page background may use large blurred SVG gradients at very low opacity.
- Pricing page may use a subtle grid/noise background; it should be barely visible.
- Avoid bright glows around cards. Reserve glow-like color for hero media and gradient text.

## 7. Do's and Don'ts

### Do
- Build dark-mode-first with `#131517` as the base and `#212325` as the primary card surface.
- Use Inter/system typography with weights 400, 500, and 600 only.
- Use white CTAs for neutral creation/sign-in actions and cranberry CTAs for Plus/upgrade actions.
- Let event artwork, category icons, and avatars provide most of the color.
- Keep event rows compact and scannable: time, title, location, cover image.
- Use faint white-opacity borders instead of heavy outlines.
- Use 8px radius for controls and 12px radius for cards.
- Use `blur(16px)` translucent surfaces when cards sit over gradients or hero visuals.
- Keep nav quiet: small logo, muted links, local time, pill sign-in.
- Clamp long titles and descriptions to prevent cards from becoming uneven.

### Don't
- Don't make the whole interface cranberry, purple, or gradient. Luma's colorful moments are accents, not the canvas.
- Don't use heavy font weights like 700/800; Luma's confidence comes from spacing and contrast, not boldness.
- Don't add marketing-card clutter to discovery surfaces; event discovery should feel like a functional agenda.
- Don't use large white page sections inside the dark public UI unless intentionally switching to light mode.
- Don't overuse shadows on dark backgrounds; use surface luminance and borders first.
- Don't replace event covers or category icons with abstract illustrations; real community content is the visual language.
- Don't make buttons square. Luma's controls are gently rounded or pill-shaped.
- Don't use all-caps labels except tiny badges such as "LIVE".
- Don't center dense operational content; only hero, pricing title, and sign-in panel should be strongly centered.

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile Small | <450px | Hero 40px, compact nav, stacked hero, tighter rows |
| Mobile | 450px-650px | Hide time in nav, horizontal scroll sections, single-column cards |
| Tablet | 650px-820px | Two-column grids where space allows, reduced hero media |
| Desktop Small | 820px-1000px | Standard discover layout, phone visual scales down |
| Desktop | 1000px-1080px | Full public layout, two-column pricing and event grids |
| Wide | >1080px | Centered max-width layouts, no unbounded stretching |

### Touch Targets
- Primary buttons: 44px minimum height
- Nav pills: 32-36px height
- Category/city tiles: at least 60px tall on mobile
- Event rows: 96-112px tall with an easy full-row tap target
- Subscribe buttons: pill shape with at least 32px height
- Icon-only actions: 32-44px diameter

### Collapsing Strategy
- **Landing**: copy + phone visual side by side -> stacked centered column; phone can become wider than the viewport for drama on very small screens.
- **Discover event grid**: 2-column desktop -> horizontal scroll with 3-row columns on mobile.
- **Category grid**: responsive card grid -> two horizontal rows of chips/cards on mobile.
- **Calendar grid**: auto-fill cards -> horizontal scroll with snap on mobile.
- **Pricing**: 2 cards side by side -> stacked cards; add-on table remains card-like and horizontally safe.
- **Nav**: hide current time first; keep Explore Events and Sign In visible as long as possible.

### Image Behavior
- Maintain square event covers; do not crop to wide thumbnails in rows.
- Keep category/city icons at fixed token sizes so labels do not shift layout.
- Landing phone visual scales proportionally and may crop horizontally on tiny screens.
- Use `object-fit: cover` for event artwork and `object-fit: contain` for category/city icons.

## 9. Agent Prompt Guide

### Quick Color Reference
- Page Background: Luma Black (`#131517`)
- Card Background: Card Black (`#212325`)
- Elevated Surface: Panel Charcoal (`#333537`)
- Primary Text: White (`#ffffff`)
- Secondary Text: `rgba(255,255,255,0.79)`
- Tertiary Text: `rgba(255,255,255,0.50)`
- Muted Text: `rgba(255,255,255,0.32)`
- Brand Accent: Cranberry (`#f31a7c`)
- Brand Accent Dark: Soft Cranberry (`#f98dbe`)
- Purple Accent: `#682fff`
- Blue Accent: `#287eff`
- Orange Accent: `#f8712b`
- Divider: `rgba(255,255,255,0.08)`
- Card Border: `rgba(255,255,255,0.04)`
- Hover Border: `rgba(255,255,255,0.16)`
- Standard Radius: 8px
- Card Radius: 12px
- Panel Radius: 24px

### Example Component Prompts
- "Create a Luma-style landing hero on `#131517`: left-aligned 64px Inter/system headline at weight 500, white text, final phrase clipped to the Luma radial rainbow gradient, 20px secondary body copy in `rgba(255,255,255,0.79)`, and a white 52px CTA button with 8px radius. Place a large phone/event mockup on the right."
- "Design a Discover Events section: centered 820px container, 32px weight-600 page title, secondary description, then a 2-column event row grid. Each row has an 80px square cover image with 8px radius, 14px muted time, 16px weight-500 title, optional location in tertiary text, and faint dividers offset after the image."
- "Build category tiles on dark background: `#212325` surface, `1px solid rgba(255,255,255,0.04)`, 12px radius, 16px padding, colorful 40px icon, 16px weight-500 label, and 13px tertiary event count. Hover border becomes `rgba(255,255,255,0.16)`."
- "Create a Luma pricing card: `#212325` background, 12px radius, faint border, 24px padding. Plan title at 18px weight 600, price at 40px weight 400, CTA full-width. Use white CTA for Free and cranberry `#f31a7c` CTA for Plus. Feature rows use small white check icons and 15px text."
- "Design a sign-in panel: centered 460px dark card, 24px radius, `1px solid rgba(255,255,255,0.16)`, 32px padding, circular gray icon well, 28px weight-600 title, dark input with subtle border, full-width white primary button, and dark secondary OAuth buttons."
- "Create a global nav: transparent/sticky top bar with `blur(16px)`, Luma star/wordmark left, local time and Explore Events link right, then a dark translucent Sign In pill. Text is 14px weight 500 in tertiary color, white on hover."

### Iteration Guide
1. Check the canvas first: if it is not near-black (`#131517`), the public Luma feeling is probably gone.
2. Reduce typography weight before changing size. Most UI should sit at 500, with 600 only for section titles.
3. Make CTAs either white or cranberry. If a CTA is blue/purple/orange, it probably looks off-brand unless it is part of a gradient moment.
4. Replace decorative graphics with event covers, avatars, category icons, or product screenshots.
5. Keep borders faint. If a card outline is clearly visible at first glance, lower it toward `rgba(255,255,255,0.04-0.08)`.
6. Clamp event and calendar text to 2 lines and preserve square imagery.
7. Use horizontal scrolling for mobile discovery sections instead of collapsing everything into a long single list.

### Known Gaps
- `https://luma.com/home` redirects to sign-in for unauthenticated visitors, so authenticated home/product dashboard rules are inferred from public Luma surfaces, the sign-in screen, discover, pricing, and shared CSS tokens.
- This is not Luma's official design system. Treat it as a practical starting point for generating Luma-like UI with an AI coding agent.
