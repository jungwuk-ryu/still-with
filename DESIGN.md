# Design System Inspired by Luma

## 1. Visual Theme & Atmosphere

Luma's light theme feels like a clean event invitation laid over a softly lit product canvas. The base is white, the typography is crisp near-black, and the product's warmth comes from restrained gradients, event imagery, and small cranberry accents rather than from heavy decoration. The interface is bright, calm, and utilitarian, but it keeps Luma's celebratory mood through colorful event covers, category icons, city badges, and the occasional rainbow brand moment.

The light theme uses `#ffffff` as the primary canvas, `#f7f8f9` and `#ebeced` as subtle surface steps, and `rgb(19,21,23)` as the dominant text color. Luma's public pages are deliberately simple: a quiet nav, large direct headings, compact event rows, rounded cards, and a consistent 8px control radius. On light backgrounds, depth comes from translucent white cards, faint black-opacity dividers, and low-opacity stacked shadows.

The brand personality is "delightful utility." Landing and creation surfaces can be playful: large product phone media, clipped gradient text, soft abstract color fields. Discovery, pricing, auth, and dashboard-like pages should become much more operational: list rows, cards, segmented controls, checklists, and tables. Keep the first impression friendly, then let the UI get out of the way.

**Key Characteristics:**
- Light-first event platform aesthetic: white canvas, soft gray surfaces, crisp near-black text
- Inter/system font stack with weight 500 as the dominant UI voice and weight 600 as the maximum emphasis
- Cranberry brand accent (`#f31a7c`) for Plus, brand links, upgrade CTAs, and small emphasis
- Rainbow brand moments: blue -> purple -> magenta -> pink -> coral -> orange gradients, used sparingly
- Black primary CTAs on light hero/product surfaces; cranberry CTAs for paid/upgrade actions
- 8px standard radius, 12px card radius, 16px large radius, 24px squircle/card-shell radius
- Event cover images and community avatars provide the main color and content personality
- Faint borders: `rgba(19,21,23,0.08)` to `rgba(19,21,23,0.16)` on light surfaces
- Translucent white cards and subtle shadows rather than heavy outlines
- Navigation is quiet: logo, current local time, "Explore Events" link, and pill-shaped sign-in button

## 2. Color Palette & Roles

### Core Light Surfaces
- **Canvas White** (`#ffffff`): Primary page background. Use for landing, discover, pricing, auth, and general app surfaces in light mode.
- **Soft Surface** (`#f7f8f9`): Secondary background for subtle section separation, hover wells, and low-priority panels.
- **Tertiary Surface** (`#ebeced`): Higher-contrast gray fill for selected segmented controls, disabled controls, and table wells.
- **Border Gray** (`#d2d4d7`): Stronger structural borders when black-opacity borders are not enough.
- **Translucent White** (`rgba(255,255,255,0.80)`): Default glassy card surface over gradients, imagery, or abstract background fields.

### Text & Content
- **Primary Ink** (`rgb(19,21,23)` / `#131517`): Primary text, headings, icons, and black CTA background.
- **Secondary Text** (`rgba(19,21,23,0.64)` / approx `#737577`): Body copy, descriptions, pricing notes.
- **Tertiary Text** (`rgba(19,21,23,0.36)` / approx `#b3b5b7`): Metadata, event times, calendar descriptions, footer links.
- **Quaternary Text** (`rgba(19,21,23,0.20)` / approx `#dee0e2`): Disabled-looking labels, placeholders, inactive UI.
- **White Text** (`#ffffff`): Text on black, cranberry, or image-overlay controls.

### Brand & Accent
- **Cranberry** (`#f31a7c`): Primary brand accent in light mode. Use for brand text, Luma Plus, upgrade CTAs, selected highlights, and API/important links.
- **Cranberry Active** (`#d5176d`): Pressed/hover state for cranberry buttons and stronger emphasis.
- **Cranberry Pale** (`rgba(243,26,124,0.133)`): Soft badges, selected states, and background tints.
- **Purple** (`#682fff`): Secondary accent for gradients, category/event visuals, and occasional branded illustration.
- **Blue** (`#287eff`): Discovery/category accent, link-like states, and gradient starts.
- **Orange** (`#f8712b`): Warm celebratory accent for gradient endpoints and local/category icon systems.

### Semantic Colors
- **Success Green** (`#3cbd2c`): Success states, accepted/registered indicators, confirmations.
- **Warning Yellow** (`#d69712`): Warning states and low-frequency status callouts.
- **Error Red** (`#ed2b32`): Validation errors, destructive states, failed payments.

### Gradients
- **Hero Text Gradient**: `radial-gradient(circle at 0 0, #099ef1 0%, #6863f8 18.82%, #d84ffa 32.6%, #f058c5 52.83%, #ff4f90 68.03%, #ff6558 87.66%, #ff891f 100%)`
- **Light Brand Gradient**: `linear-gradient(-45deg, #8a18a8 0%, #ce2756 51.59%, #cf2a55 51.6%, #e7a90d 100.05%)`
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

**Black Primary CTA** ("Create Your First Event", "Get Started", "Continue")
- Background: `#131517`
- Text: `#ffffff`
- Height: 44-52px depending on context
- Padding: 12px 24px
- Radius: 8px or full pill for nav-sized actions
- Weight: 500
- Hover: shift to `#333537` or reduce opacity slightly; keep the high-contrast black block

**Cranberry Primary CTA** ("Get Luma Plus")
- Background: `#f31a7c`
- Text: `#ffffff`
- Height: 44px
- Radius: 8px
- Hover/active: `#d5176d`
- Use only for paid upgrade, brand-critical, or high-commitment actions

**Light Secondary Button**
- Background: `#f7f8f9` or `rgba(19,21,23,0.04)`
- Text: Primary Ink
- Border: optional `1px solid rgba(19,21,23,0.08)`
- Radius: 8px or pill
- Use for OAuth sign-in, passkey, neutral toggles, and secondary actions

**Segmented Control**
- Outer background: `rgba(19,21,23,0.08)` or `#ebeced`
- Selected segment: `#ffffff` with small shadow or `#d2d4d7` when the shell is very light
- Text: selected Primary Ink, unselected Secondary/Tertiary Text
- Radius: 9999px
- Compact padding: 6px 14px

**Icon / Link Button**
- Background: transparent by default
- Icon/text color: Secondary or Tertiary Text; hover to Primary Ink
- Motion: arrow icons translate by 1px on hover
- Use for "Explore Events" external-link actions, footer icons, and card affordances

### Cards & Containers

**Content Card**
- Background: `rgba(255,255,255,0.80)` or `#ffffff`
- Border: `1px solid #ffffff` over tinted backgrounds, or `1px solid rgba(19,21,23,0.08)` on plain white
- Radius: 12px; large card shells may use 16px
- Backdrop: `blur(16px)` when sitting over gradients or imagery
- Hover: border shifts to `rgba(19,21,23,0.16)`, shadow softly deepens

**Event Row**
- Layout: 80px square image on left, text stack on right
- Cover radius: 8px
- Padding: 12px 16px
- Gap: 16px
- Divider: 1px `rgba(19,21,23,0.08)` offset after the image
- Hover: row background becomes `rgba(147,149,151,0.133)` or cover scales to `1.05`
- Title: 16-18px weight 500, 2-line clamp, Primary Ink
- Metadata: time first, location second; use Tertiary Text

**Category Tile**
- Background: `#ffffff` or `rgba(255,255,255,0.80)`
- Border: `1px solid rgba(19,21,23,0.08)`
- Radius: 12px
- Layout: icon at 40-48px, category name, event count
- Icon: colorful image or line icon with category tint; do not monochrome these
- Grid: `repeat(auto-fill, minmax(220px-240px, 1fr))`

**Calendar Card**
- Background: `#ffffff`
- Border: `1px solid rgba(19,21,23,0.08)`
- Radius: 12px
- Padding: 16px
- Avatar: 48px square/circle, top-left
- Subscribe pill: top-right, light secondary button
- Description: 2-line clamp in Secondary/Tertiary Text

**Pricing Card**
- Background: `rgba(255,255,255,0.80)` or `#ffffff`
- Border: `1px solid rgba(19,21,23,0.08)`
- Radius: 12px
- Padding: 24px
- Check icons: Primary Ink or cranberry circles/checks at 14-16px
- Dividers: faint horizontal rules between feature groups
- Free plan CTA: black; Plus plan CTA: cranberry

**Sign-In Panel**
- Width: ~430-460px
- Background: `rgba(255,255,255,0.86)` or `#ffffff`
- Border: `1px solid rgba(19,21,23,0.08)`
- Radius: 24px
- Padding: 32px
- Top icon: circular soft-gray well, 64px
- Inputs: white or `#f7f8f9` background, subtle border, 8px radius
- Primary action: full-width black button

### Inputs & Forms

**Text Input**
- Background: `#ffffff` or `#f7f8f9`
- Border: `1px solid #d2d4d7`
- Text: Primary Ink
- Placeholder: Tertiary Text
- Radius: 8px
- Padding: 12px 14px
- Focus: border switches to Primary Ink or cranberry; avoid thick glow

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
- Background: transparent over page background; sticky pages may use translucent white and backdrop blur
- Backdrop: `blur(16px)` when sticky
- Left: Luma star or wordmark in Primary Ink or Tertiary Text
- Right: local time, "Explore Events" external-link action, Sign In pill
- Text: 14px, weight 500, Secondary/Tertiary Text by default, Primary Ink on hover
- Sign In: light gray or black pill depending on page importance; prefer black when it is the main action

**Footer**
- Top border: `1px solid rgba(19,21,23,0.08)`
- Logo + links left, app/social icons right
- Secondary links below on landing and pricing
- "Host your event with Luma" external-link copy may use a clipped gradient text treatment

### Image Treatment

- **Landing phone visual**: large phone video/mockup, 620px wide on desktop; it can dominate the right half of the hero.
- **Event covers**: square, 80px in event rows, 8px radius, `object-fit: cover`.
- **Calendar avatars**: 48px, rounded square/circle depending on source.
- **Category icons**: bright icon images on transparent/light tiles; preserve their native color.
- **City icons**: 40px circular colored tokens with white pictograms.
- **Light image rule**: do not brighten images. Let event artwork retain natural contrast on the white page.

### Signature Components

**Rainbow Hero Word**
- Use only on the final phrase or one short word group.
- Clip the radial gradient to text with transparent fill.
- Surround it with otherwise Primary Ink headline text.

**Discover Event Grid**
- Desktop: 2 columns of event rows, each row 80px cover + text.
- Mobile: horizontal scroll with 3 stacked rows per column; use scroll snap.
- Keep event content dense; discovery should feel like a curated local agenda.

**Pricing Matrix**
- Two large cards side by side, then add-on table and enterprise strip.
- Light abstract background or very subtle grid texture is acceptable, but keep it low-contrast.
- Use cranberry only for the Plus plan and related links.

## 5. Layout Principles

### Spacing System
- **Base unit**: 4px with 8px as the practical rhythm
- **Common scale**: 4px, 6px, 8px, 10px, 12px, 16px, 18px, 20px, 24px, 32px, 48px, 64px
- **Container padding**: 16px mobile, 24px tablet, 32px desktop when inside card-heavy pages
- **Landing hero**: large vertical breathing room, 80vh minimum, but footer or next section should remain discoverable after the hero
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
- **White space is the canvas.** Empty white space should feel clean and editorial, not unfinished.
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
| Level 0 | `#ffffff` background, no shadow | Page canvas |
| Level 1 | `#f7f8f9` surface or faint black-opacity hover fill | Hover rows, low-priority panels |
| Level 2 | `#ffffff` or `rgba(255,255,255,0.80)` + `1px solid rgba(19,21,23,0.08)` | Cards, category tiles, inputs |
| Level 3 | `#ebeced` or stronger `rgba(19,21,23,0.16)` border | Selected controls, tables, sub-panels |
| Hover | Border to `rgba(19,21,23,0.16)` + soft light shadow | Hoverable content cards |
| Floating | `0 1.6px 3px rgba(0,0,0,.02), 0 4.2px 7px rgba(0,0,0,.03), 0 8px 14px rgba(0,0,0,.04), 0 17.5px 29px rgba(0,0,0,.05), 0 48px 80px rgba(0,0,0,.06)` | Menus, popovers, floating panels |
| Modal | `0 0 0 1px rgba(19,21,23,0.08), 0 3px 3px rgba(0,0,0,.03), 0 8px 7px rgba(0,0,0,.04), 0 17px 14px rgba(0,0,0,.05), 0 35px 29px rgba(0,0,0,.06), 0 -4px 4px rgba(0,0,0,.04) inset` | Dialogs, auth panels, command-like modals |

### Shadow Philosophy
Luma's light depth is soft, layered, and low contrast. The first read of hierarchy comes from surface steps (`#ffffff` -> `#f7f8f9` -> `#ebeced`), then from faint black-opacity borders. Shadows should feel ambient rather than dramatic. Cards should feel gently placed on the page, not floating above it.

### Decorative Depth
- Landing page background may use large blurred SVG gradients at very low opacity.
- Pricing page may use a subtle grid/noise background; it should be barely visible.
- Avoid bright glows around cards. Reserve glow-like color for hero media and gradient text.
- Use `backdrop-filter: blur(16px)` only when the card sits over a gradient, photo, or translucent sheet.

## 7. Do's and Don'ts

### Do
- Build light-mode-first with `#ffffff` as the base and `#f7f8f9` / `#ebeced` as supporting surfaces.
- Use Inter/system typography with weights 400, 500, and 600 only.
- Use black CTAs for neutral creation/sign-in actions and cranberry CTAs for Plus/upgrade actions.
- Let event artwork, category icons, and avatars provide most of the color.
- Keep event rows compact and scannable: time, title, location, cover image.
- Use faint black-opacity borders instead of heavy gray outlines.
- Use 8px radius for controls and 12px radius for cards.
- Use translucent white surfaces when cards sit over gradients or hero visuals.
- Keep nav quiet: small logo, muted links, local time, pill sign-in.
- Clamp long titles and descriptions to prevent cards from becoming uneven.

### Don't
- Don't make the whole interface cranberry, purple, or gradient. Luma's colorful moments are accents, not the canvas.
- Don't default to dark panels on light pages unless representing a phone/product preview.
- Don't use heavy font weights like 700/800; Luma's confidence comes from spacing and contrast, not boldness.
- Don't add marketing-card clutter to discovery surfaces; event discovery should feel like a functional agenda.
- Don't overuse shadows. In light theme, use surface steps and faint borders first.
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
- Page Background: Canvas White (`#ffffff`)
- Soft Background: Soft Surface (`#f7f8f9`)
- Tertiary Surface: `#ebeced`
- Card Background: White / Translucent White (`rgba(255,255,255,0.80)`)
- Primary Text: Primary Ink (`#131517`)
- Secondary Text: `rgba(19,21,23,0.64)`
- Tertiary Text: `rgba(19,21,23,0.36)`
- Muted Text: `rgba(19,21,23,0.20)`
- Brand Accent: Cranberry (`#f31a7c`)
- Brand Accent Active: `#d5176d`
- Purple Accent: `#682fff`
- Blue Accent: `#287eff`
- Orange Accent: `#f8712b`
- Divider: `rgba(19,21,23,0.08)`
- Hover Border: `rgba(19,21,23,0.16)`
- Standard Radius: 8px
- Card Radius: 12px
- Panel Radius: 24px

### Example Component Prompts
- "Create a Luma-style light landing hero on `#ffffff`: left-aligned 64px Inter/system headline at weight 500, primary ink text, final phrase clipped to the Luma radial rainbow gradient, 20px secondary body copy in `rgba(19,21,23,0.64)`, and a black 52px CTA button with 8px radius. Place a large phone/event mockup on the right."
- "Design a Discover Events section: centered 820px container, 32px weight-600 page title, secondary description, then a 2-column event row grid. Each row has an 80px square cover image with 8px radius, 14px muted time, 16px weight-500 title, optional location in tertiary text, and faint dividers offset after the image."
- "Build category tiles on a light background: `#ffffff` surface, `1px solid rgba(19,21,23,0.08)`, 12px radius, 16px padding, colorful 40px icon, 16px weight-500 label, and 13px tertiary event count. Hover border becomes `rgba(19,21,23,0.16)`."
- "Create a Luma pricing card: white/translucent white background, 12px radius, faint black-opacity border, 24px padding. Plan title at 18px weight 600, price at 40px weight 400, CTA full-width. Use black CTA for Free and cranberry `#f31a7c` CTA for Plus. Feature rows use small check icons and 15px text."
- "Design a sign-in panel: centered 460px light card, 24px radius, `1px solid rgba(19,21,23,0.08)`, 32px padding, circular soft-gray icon well, 28px weight-600 title, light input with subtle border, full-width black primary button, and light secondary OAuth buttons."
- "Create a global nav: transparent/sticky top bar with optional translucent white blur, Luma star/wordmark left, local time and Explore Events link right, then a rounded Sign In pill. Text is 14px weight 500 in secondary/tertiary color, primary ink on hover."

### Iteration Guide
1. Check the canvas first: if it is not primarily white or very light gray, the light-theme Luma feeling is probably gone.
2. Reduce typography weight before changing size. Most UI should sit at 500, with 600 only for section titles.
3. Make CTAs either black or cranberry. If a CTA is blue/purple/orange, it probably looks off-brand unless it is part of a gradient moment.
4. Replace decorative graphics with event covers, avatars, category icons, or product screenshots.
5. Keep borders faint. If a card outline is clearly visible at first glance, lower it toward `rgba(19,21,23,0.08)`.
6. Clamp event and calendar text to 2 lines and preserve square imagery.
7. Use horizontal scrolling for mobile discovery sections instead of collapsing everything into a long single list.

### Dark Theme Fallback
- Dark mode can invert the canvas to `#131517`, cards to `#212325`, and text to `#ffffff` / `rgba(255,255,255,0.79)`.
- Keep the same component geometry, spacing, typography, and interaction model when switching themes.

### Known Gaps
- `https://luma.com/home` redirects to sign-in for unauthenticated visitors, so authenticated home/product dashboard rules are inferred from public Luma surfaces, the sign-in screen, discover, pricing, and shared CSS tokens.
- This is not Luma's official design system. Treat it as a practical starting point for generating Luma-like UI with an AI coding agent.
