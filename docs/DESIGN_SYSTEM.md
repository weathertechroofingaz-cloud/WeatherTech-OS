# WeatherTech OS Design System

This document records the current WeatherTech OS visual and interaction standards. It documents the existing implementation and gives future guidance for consistent work.

## Design Philosophy

WeatherTech OS should feel like a premium operating system for roofing and painting contractors, not a generic CRM. The interface should help office staff and field teams answer operational questions quickly while preserving WeatherTech Roofing LLC and IHC Painting company context.

## Branding

Current implementation:

- WeatherTech Roofing LLC uses purple as the primary brand color with orange as an accent.
- IHC Painting uses orange-focused primary accents through the `wt-company-painting` class.
- The active company changes sidebar initials, brand accent color, and selected/primary states.

Guidance:

- Use purple selectively for WeatherTech active states, primary actions, roofing emphasis, and selected navigation.
- Use orange selectively for IHC Painting and urgent/actionable contractor context.
- Do not tint every surface with brand colors.

## Color Philosophy

Core theme variables live in `app/globals.css`:

- `--wt-page`
- `--wt-surface`
- `--wt-surface-muted`
- `--wt-ink`
- `--wt-muted`
- `--wt-border`
- `--wt-roofing-purple`
- `--wt-roofing-orange`
- `--wt-painting-orange`
- `--wt-primary`
- `--wt-accent`
- `--wt-success`
- `--wt-warning`
- `--wt-danger`

Guidance:

- Use semantic status colors for meaning, not decoration.
- Red/orange should signal risk, urgency, warning, or required action.
- Green should signal healthy, collected, completed, or successful states.
- Neutral surfaces should carry most of the interface.

## Typography

Current implementation:

- Global font stack starts with Inter and falls back to system UI fonts.
- Headings use bold slate/ink text.
- Supporting labels use smaller text and muted color.
- Many cards use uppercase metadata labels for scannability.

Guidance:

- Important values should be larger and heavier than supporting copy.
- Avoid tiny dense text for critical workflow state.
- Keep line lengths readable on desktop and mobile.

## Spacing

Current implementation:

- Tailwind spacing utilities define layout rhythm.
- Major workspaces use section/card spacing with responsive grids.
- Mobile layouts stack vertically.

Guidance:

- Prefer fewer, stronger surfaces over dense walls of identical cards.
- Keep forms and operational panels compact but not cramped.
- Preserve vertical rhythm across dashboard, CRM, jobs, and customer workspaces.

## Card Layouts

Current implementation:

- Cards commonly use rounded corners, borders, white or themed surfaces, and subtle shadows.
- Dark mode uses CSS variables and additional surface hierarchy.

Guidance:

- Every card should have a clear purpose.
- Use larger cards for operationally important information and smaller cards for supporting data.
- Empty cards must provide truthful empty states instead of blank space.
- Avoid nested cards unless the nested item is a repeated child record.

## Buttons

Current implementation:

- Primary actions use filled dark or brand-colored buttons.
- Secondary actions use bordered neutral buttons.
- Icon usage comes from `lucide-react`.

Guidance:

- Use button text that matches the action.
- Do not create fake success states for provider or customer actions.
- Disabled or unavailable actions should clearly explain configuration requirements when possible.

## Forms

Current implementation:

- Forms are built with native inputs, selects, textareas, and React submit handlers.
- The app uses success/error notifications and prevents some duplicate submission states.

Guidance:

- Capture form references before async reset work, or use controlled state.
- Clear only the submitted form after successful save.
- Show useful error messages without exposing secrets.
- Keep touch targets large enough for mobile field work.

## Tables And Lists

Current implementation:

- Many workspaces use responsive list/table hybrids.
- Desktop views can use grid columns; mobile stacks row details.

Guidance:

- Use tables when comparison matters.
- Use cards/lists when each item has a different operational state or action.
- Keep labels visible; do not truncate critical customer, job, or estimate identifiers.

## Icons

Current implementation:

- Icons come from `lucide-react`.
- Navigation and status surfaces use icon + label patterns.

Guidance:

- Use familiar icons for common actions.
- Do not introduce hand-drawn SVG icons when a Lucide icon exists.
- Icons should support text, not replace important labels unless the control is universally recognizable.

## Navigation

Current implementation:

- Navigation is grouped by workspace categories in `CrmApp`.
- Sidebar is dark, scrollable on smaller heights, and uses active selected states.
- Keyboard shortcuts support quick view changes and search focus.

Guidance:

- Keep navigation grouped and predictable.
- Put new workflows in existing groups whenever possible.
- Quick actions should navigate into existing modules rather than creating duplicate flows.

## Dashboard Hierarchy

Current implementation:

- Dashboard is the owner command center.
- Operations, sales, production, communications, financial, and integration summaries are derived from existing CRM snapshot data.

Guidance:

- Dashboard should answer what needs attention today.
- Move detailed workflows into their modules.
- Avoid repeating the same operational queue in multiple dashboard sections.

## Responsive Behavior

Current implementation:

- Tailwind responsive classes drive desktop/tablet/mobile layouts.
- Browser regression checks include horizontal overflow expectations for key workspaces.

Guidance:

- No horizontal scrolling in core workspaces.
- Cards should stack on mobile and keep touch targets readable.
- Sidebar, forms, and production workflows must remain usable at narrow widths.

## Accessibility Guidance

Current implementation:

- Global focus-visible styles use the brand ring variable.
- Buttons and form fields use native elements.
- Toasts and workspace feedback include explicit controls in current implementation.

Guidance:

- Preserve visible focus states.
- Maintain readable contrast in light and dark mode.
- Use labels, aria labels, and semantic controls where possible.
- Do not trap focus with temporary overlays.

## Dark Mode Standards

Current implementation:

- Dark mode is controlled by `data-theme="dark"` on the root element.
- Dark tokens use distinct page, surface, muted, border, and brand variables.

Guidance:

- Treat dark mode as an intentional theme, not a color inversion.
- Keep parent sections, cards, selected states, and hover states visibly distinct.
- Do not use pale light-mode warning/success fills in dark mode.
- Verify dashboard, navigation, customer, and jobs views after dark-mode changes.

## Consistency Rules

- Reuse existing component patterns before creating new visual language.
- Do not redesign completed modules without an approved UI sprint.
- Keep WeatherTech and IHC branding recognizable but restrained.
- Match terminology to roofing and painting operations.
- Prefer clear hierarchy over more information.
