# LogEarn Growth — Master Design System

> UI-UX Pro Max v2.0 dataset-based design system, adapted to the existing LogEarn brand and current Vite + vanilla JavaScript + CSS + ECharts application.
>
> Status: design baseline for review. This does not claim that every page or component has been migrated.
> Updated: 2026-11-09

## 1. Product and design intent

- Product type: **Analytics Dashboard** (primary), with **Fintech/Crypto** operating context (secondary).
- Surface: internal desktop growth, product analytics, and operations workspace — not a consumer trading terminal or marketing landing page.
- Primary users: growth, product, and operations teammates.
- Primary job: in 30 seconds, understand what changed, where the bottleneck is, whether the evidence is reliable, and what action should happen next.
- Platform: desktop-first. Keep the existing desktop navigation and workflows; mobile redesign is outside this project scope.
- Stack: Vite, native JavaScript, CSS, and ECharts. Do not add React, Tailwind, shadcn, or a component framework for visual polish alone.

## 2. UI-UX Pro Max matching

Selected matches from the open-source UI-UX Pro Max product, reasoning, style, color, typography, chart, and UX datasets:

| Domain | Selected match | Application |
| --- | --- | --- |
| Product | Analytics Dashboard | Main product category |
| Product | Fintech/Crypto | Data trust, security perception, and operational context |
| Pattern | Data-Dense + Drill-Down | Summary → evidence → user/record detail |
| Style | Data-Dense Dashboard | Efficient KPI, chart, and table layout |
| Style | Dark Mode (OLED) | Dark-first surface hierarchy |
| Style | Minimalism & Swiss Style | Typography, alignment, restraint, and consistency |
| Typography | Minimal Swiss / Inter | One readable sans-serif family with clear weights |
| Charts | Line, Bar, Funnel, Anomaly Highlights | Match visualization to the underlying data |

The Financial Dashboard palette in the dataset is a reference for semantic roles only. Preserve LogEarn's existing navy, blue, and green identity rather than replacing it with generic neon crypto colors.

## 3. Design dials

| Dial | Value | Decision |
| --- | ---: | --- |
| Visual variance | 4/10 | Structured and restrained; avoid experimental layouts |
| Motion intensity | 2/10 | Functional transitions only |
| Information density | 8/10 | Dense enough for analysts, with clear grouping and progressive disclosure |

High density does not mean showing every control and every caveat at once.

## 4. Color system

Keep the existing semantic tokens as the initial source of truth. Do not introduce new per-page hex values without a documented reason.

| Role | Existing token | Current value |
| --- | --- | --- |
| App background | --a-bg | #0b0f17 |
| Main surface | --a-panel | #151d29 |
| Primary text | --a-text | #f1f5f9 |
| Secondary text | --a-muted | #94a3b8 |
| Divider / border | --a-border | #263244 |
| Brand / interactive accent | --a-accent | #91a6ff |
| Strong interactive accent | --ui-accent-strong | #6d8cff |
| Positive / healthy | --a-green | #81d6b0 |
| Warning | --a-warn | #f1bd76 |
| Danger | --ui-danger | #ffbeb3 |
| Unknown / neutral | semantic neutral grey | muted text and border |

Rules:
- Use green for positive or healthy, amber for warning/degraded, red for critical/failure, and neutral grey for unknown or not measured.
- Never communicate state by color alone; include text, icon, or an explicit status label.
- Keep normal text contrast at or above 4.5:1 and verify actual foreground/background pairs.
- Do not use neon green, purple-pink gradients, glow, or glass surfaces as the default visual language.
- Reserve blur and scrims for modal separation, not decorative cards.

## 5. Typography

- Font family: Inter where available, followed by the platform system sans-serif stack and Chinese fallbacks such as PingFang SC and Microsoft YaHei.
- Body: 14px desktop baseline; dense metadata may use 12–13px but must remain readable.
- Page title: 22–26px; section title: 16–18px; KPI value: 26–32px.
- Use tabular numerals for counts, percentages, currency, latency, and time values.
- Use weight and spacing for hierarchy; do not make every heading bold or oversized.
- Long explanations and metric definitions should be secondary or collapsible, not competing with the primary metric.

## 6. Layout and spacing

- Desktop workspace: existing 248px expanded sidebar / 64px compact sidebar; 64px top toolbar.
- Content width: target maximum 1540px where the viewport allows it.
- Use a 12-column grid for dashboard composition.
- Page gutters: 24–32px; section spacing: 20–24px; card gaps: 12–16px.
- Use the existing 4px spacing rhythm. Common values: 4, 8, 12, 16, 24, 32px.
- KPI cards: 12–16px internal padding.
- Dense data tables: 36–42px row height; sticky headers only when they improve scanning.
- Keep cards visually quiet: thin border, restrained surface contrast, little or no shadow.
- Avoid nested scroll containers. Prefer one page scroll plus a clearly bounded table scroll only when necessary.

## 7. Component rules

### Page header
- One clear title, one short purpose statement, and only controls relevant to that page.
- Show date range and data freshness near the page title or result summary.
- Keep secondary actions in a toolbar or overflow menu.

### KPI card
- Label, primary value, period/denominator, and optional comparison.
- Do not add decorative sparklines unless they reveal a meaningful trend.
- Missing, immature, or incomplete data must render as unknown / pending / insufficient coverage — never as a fabricated zero.

### Filters
- Separate draft values from applied values.
- Show a compact summary of applied filters.
- Keep advanced filters collapsed by default.
- Scope filters to the page or analysis that consumes them; do not expose irrelevant funnel controls on SEO or reliability pages.
- Provide explicit Apply and Reset actions when the query is not live.

### Tables
- Clear column labels, consistent number alignment, sortable headers where supported, row hover/focus, and useful empty states.
- Preserve existing drill-down actions and context.
- Provide a text/table alternative for chart-only insights.
- Do not hide important status or error information behind hover.

### Charts
- Trend over time → line chart.
- Category comparison → sorted bar chart.
- Sequential conversion → funnel or flow chart with stage values and conversion rates.
- Anomalies → line chart with distinct markers and a persistent event list.
- Proportion → pie/donut only for five or fewer categories; otherwise use bars.
- Include visible legends, units, readable axes, direct labels where practical, and a concise text summary.

### Drawers and dialogs
- Use for detail, configuration, and secondary workflows — not primary navigation.
- Provide a visible close/cancel route and preserve parent page context.
- Focus must remain visible and keyboard-operable.

## 8. Data and interaction states

Every data-backed component should distinguish:
- Loading
- Success / current
- Partial or stale result
- Empty (valid query, no records)
- Error (request failed)
- Unavailable (capability not supported or not configured)
- Unknown (no trustworthy measurement)

Rules:
- Old data must be explicitly marked as old or partial.
- Missing coverage is not zero and is not proof of churn.
- Request errors must include a clear recovery action.
- Retries are user-initiated; never auto-repeat a potentially billable AI operation.
- Disable duplicate submissions while an action is in flight and show progress.
- Preserve filters, period, audience, and drill-down context when navigating back.
- Do not allow hover-only access to critical actions.

## 9. Motion

- Default interaction timing: 120–180ms for hover/focus/pressed state.
- Use 180–240ms only for meaningful panel or drawer transitions.
- No ambient animated gradients, perpetual KPI counting, or decorative pulsing.
- Live status may use a restrained indicator, but must also show text.
- Respect prefers-reduced-motion.

## 10. Accessibility and quality bar

- Visible keyboard focus on every interactive control.
- Logical Tab order and semantic buttons/labels.
- Icon-only controls require an accessible name.
- Focus must not be hidden behind sticky headers, drawers, or banners.
- Text contrast ≥4.5:1; meaningful non-text controls and chart marks need sufficient contrast.
- Status, trend, and chart meaning must not depend on color alone.
- Error messages should explain the cause and the next recovery action.
- Empty states should explain what is missing and how to proceed.

## 11. Anti-patterns to avoid

- Turning the workspace into a neon cyberpunk trading terminal.
- Glassmorphism or blur on every card.
- Equal visual emphasis for every metric and every section.
- Showing every advanced filter expanded by default.
- Repeating the same data caveat under every card.
- A chart without units, legend, labels, or a text/table alternative.
- Green/red color as the only status signal.
- Showing stale or incomplete data as current.
- Treating an unobserved event as a zero or a churn event.
- Changing business formulas, query parameters, permissions, or AI cost controls as part of a visual-only task.

## 12. Implementation guardrails

1. Read the page module and its tests before changing markup or styles.
2. Preserve API calls, data contracts, SQL, permissions, snapshot semantics, and AI cost safeguards.
3. Reuse existing tokens and shared components; do not create a second component system.
4. Audit the active CSS import order before enabling dormant stylesheets or deleting legacy rules.
5. Make one representative page coherent before migrating the whole workspace.
6. Validate with existing Vitest and Vite build; then perform real desktop browser visual and keyboard checks.
7. Do not claim visual acceptance from static code inspection alone.
