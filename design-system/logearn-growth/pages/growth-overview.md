# Page Override — Growth Overview

> Inherits design rules from ../MASTER.md. This page-specific document overrides the master only where stated.
> Status: proposal for review; no UI implementation implied.

## Page job

Answer four questions quickly:
1. Is core product usage improving?
2. Where is the largest activation or retention bottleneck?
3. Is the underlying evidence current and complete?
4. What should the growth team inspect next?

The page is a decision surface, not a complete report archive.

## Recommended information hierarchy

### 1. Header and context
- Title: Growth Overview / Platform Overview.
- One-line purpose: usage, return behavior, and trading quality.
- Period selector and data freshness remain visible.
- Refresh and save/load actions are secondary.

### 2. Attention strip
Show only active, high-impact signals:
- Service reliability incidents or degraded endpoints.
- Data coverage gaps or stale snapshots.
- Critical transaction failure / pending-confirmation changes.
- Important AI task requiring human action.

Each item must include a status label and a route to its detail page. Hide the strip when there is nothing actionable; do not create fake warnings.

### 3. North Star hero
Make the weekly core analysis metric the primary visual anchor:
- Current weekly core users.
- Target and target date.
- Progress toward target.
- Change versus the previous complete period.
- Clear definition link.

Keep the denominator, time window, and maturity caveat adjacent to the metric. A target is not a forecast.

### 4. Core growth KPI row
Limit the first row to four decision-relevant measures:
- Weekly core analysis users.
- Effective analysis users in the selected period.
- New visitor → first successful chip analysis conversion.
- First analysis → D1 return, only when the observation window is mature.

Use an explicit unavailable / observation-not-finished state when the denominator is not mature.

### 5. Growth engine
- Show the activation path as a sequential funnel only when the steps and time windows are compatible.
- Show the largest measured drop-off, not a decorative funnel.
- Provide a direct route to the full funnel and user-level drill-down.
- Do not multiply unrelated conversion rates into a synthetic end-to-end rate.

### 6. Retention and audience quality
- Show repeat analysis and weekly usage distribution.
- Use cohort/segment comparisons only when the audience and observation windows are comparable.
- Link to Segments for detailed audience work; keep the full filter builder off the overview.

### 7. Trading and operational quality
- Keep transaction success, failures, and pending confirmations visible as a separate quality block.
- Keep turnover, assets, and credit/entitlement signals below the core growth story or behind a detail disclosure.
- Do not label turnover as revenue or asset balance as paid value.

### 8. Evidence and definitions
- Move long metric definitions, coverage caveats, and full daily tables into expandable detail sections.
- Keep one concise global coverage statement near the bottom.
- Preserve links to tracking diagnostics and source evidence.

## Interaction rules

- The overview should not open with the full advanced funnel configuration.
- Use a compact page-level period control; show only filters that affect this overview.
- Keep applied filters visible as chips or a compact summary.
- Use one primary action per section; diagnostic links are secondary.
- Drill-down must preserve the period and audience context.

## Acceptance checks

- A teammate can identify the North Star, its target, the largest current bottleneck, and data freshness without scrolling through multiple full tables.
- The first viewport contains no more than four primary KPI cards plus the North Star.
- No incomplete or stale metric is rendered as a current zero.
- The attention strip only shows actionable, evidenced issues.
- All existing metric definitions and drill-down destinations remain available.
