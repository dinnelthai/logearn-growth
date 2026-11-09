# UI-UX Pro Max adoption and current UI audit

Date: 2026-11-09
Target branch: master
Scope: desktop UI/UX only. No business logic, data definitions, API contracts, SQL, permissions, or AI cost controls changed in this design pass.

## UI-UX Pro Max matching

The open-source UI-UX Pro Max repository was reviewed and its v2 design intelligence was applied to the LogEarn Growth context.

Selected dataset matches:
- Product: Analytics Dashboard (primary).
- Product: Fintech/Crypto (secondary context).
- Reasoning pattern: Data-Dense + Drill-Down.
- Styles: Data-Dense Dashboard, Dark Mode (OLED), Minimalism & Swiss Style.
- Typography: Minimal Swiss / Inter.
- Charts: line for trends, bar for comparisons, funnel for sequential conversion, line-with-highlights for anomalies.
- UX priorities: accessibility, visible focus, keyboard operation, progressive disclosure, explicit loading/error/stale states, and context-preserving drill-down.

The result is intentionally not a cyberpunk or neon crypto redesign. It preserves the current LogEarn navy/blue/green language and uses restrained motion and a dense-but-readable desktop layout.

## Findings from current running pages

### Growth Overview
- The page contains the North Star, activation drivers, retention/core-user information, wallet assets, turnover, and transaction quality in one long view.
- Important growth decisions compete with detailed tables and long metric caveats.
- Recommendation: prioritize the North Star and four core KPIs, then growth bottleneck and operational alerts; move full tables and long definitions into details.

### Segments
- The page exposes multiple layers of audience selection and a large advanced filter set.
- Recommendation: separate the selected audience from segment rules; show a compact applied-filter summary; keep advanced conditions collapsed by default.

### SEO
- The SEO report has its own data source, period, property, and synchronization state.
- The shared funnel/analysis controls can appear above the SEO content when the shared filter panel is open, even though they are not SEO-specific.
- Recommendation: render only filters consumed by the current page; keep Search Console connection and sync settings in a dedicated disclosure or settings area.

### System Reliability
- The reliability surface should be operational and evidence-first: overall status, latency/error KPIs, endpoint health, incident history, and safe investigation details.
- Authenticated endpoint checks must execute server-side with dedicated credentials; the browser must never receive monitoring secrets.

## Repository implementation note

The current master frontend/src/main.js imports:
1. styles.css
2. polish.css
3. brand-logo.css
4. growth-agent-ui.css

The repository also contains ui-tokens.css, workspace.css, and visual-polish.css, but these files are not imported by the current main.js import list. An earlier design note describes a different import chain; it should not be treated as proof that these styles are active on master.

Do not bulk-import dormant stylesheets or delete legacy CSS without first checking selector overlap, cascade order, page-specific dependencies, and actual browser output.

## Rollout sequence

1. Confirm the Master design system and the Growth Overview / System Reliability page proposals.
2. Audit the active CSS cascade and establish one authoritative token import path.
3. Implement the Growth Overview hierarchy using existing metrics and components only.
4. Implement System Reliability UI against an agreed monitoring data contract; do not fake live endpoint data.
5. Reduce filter complexity on Segments and scope SEO controls to SEO.
6. Migrate remaining pages incrementally.
7. Run frontend tests/build, then perform real desktop browser screenshot, keyboard, and state checks.

## Local Codex skill installation

The UI-UX Pro Max maintainers recommend installing the CLI for Codex:

~~~bash
npm install -g ui-ux-pro-max-cli
cd /Users/leon/Documents/work/Logearn-growth
uipro init --ai codex
~~~

This local CLI installation is not run by this design-document commit. It allows Codex in the local workspace to load the official skill and its searchable dataset in future UI/UX implementation sessions.

## Scope and verification

This commit adds design documentation only. It does not modify frontend JavaScript/CSS, backend services, monitoring probes, production data, or user workflows. The page proposals are not implemented or visually accepted yet.
