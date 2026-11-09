# Page Override — System Reliability

> Inherits design rules from ../MASTER.md. This page-specific document defines the proposed reliability experience.
> Status: UX/UI proposal; monitoring implementation and backend capability are separate work.

## Page job

Within ten seconds, answer:
- Is LogEarn usable right now?
- Which endpoint or workflow is failing?
- Does the failure affect public or authenticated users?
- What changed, when did it start, and where should the operator investigate?

## Recommended layout

### 1. Header
- Title: System Reliability.
- Environment and time-window selector.
- Last successful monitoring cycle.
- Manual “Check now” action.

### 2. Overall service status
A single, prominent status:
- Healthy
- Degraded
- Down
- Unknown
- Stale

Show the status in text, not color alone. If no recent check exists, show Unknown or Stale — never Healthy by default.

### 3. KPI strip
Use only measured values:
- Monitored endpoints.
- 5xx error rate.
- 504 timeout count.
- P50 / P95 latency.
- Active incidents.

Every KPI includes its time window and sample count. Do not display a percentage without a denominator.

### 4. Endpoint health table
Group by user journey or service:
- Public endpoints.
- Authenticated endpoints.
- Critical workflows (login, token detail, chip analysis, strategy, trading).

Suggested columns:
- Endpoint / workflow.
- Authentication requirement.
- Current status.
- Last successful check.
- P50 / P95 latency.
- 5xx / 504 count.
- Last failure.
- Detail action.

The table should support filtering by status, auth mode, and service group. Keep the default view focused on unhealthy or recently changed endpoints, with an option to show all.

### 5. Incident timeline
For each incident show:
- Start and end time (or ongoing).
- Affected endpoint/workflow.
- Status and severity.
- Error class (timeout, server error, auth failure, DNS/network, unknown).
- Duration and evidence.
- Resolution or next investigation step.

A 504 should be classified as a timeout, not silently merged into a generic “failed” count.

### 6. Endpoint detail drawer
Include:
- Method and route template.
- Auth mode.
- Probe cadence and configured thresholds.
- Recent latency/error samples.
- Request/correlation ID where safe.
- Sanitized error summary.
- Links to related incidents.

Never expose cookies, bearer tokens, API keys, user secrets, or full sensitive response bodies.

## Authenticated endpoint monitoring

Authenticated APIs can be monitored, but the probe must run server-side:
- Use a dedicated least-privilege monitoring account or controlled service session.
- Store credentials and refresh tokens only in server-side secret storage.
- Refresh and rotate sessions server-side; never put credentials in browser code, DOM, local storage, or client logs.
- Distinguish “auth probe expired / needs renewal” from “service endpoint is down”.
- Prefer safe read-only probes. Mutating workflows require an isolated test environment, cleanup, and explicit approval.
- Do not report an authenticated endpoint as healthy if the authentication check itself failed.

## Status semantics

| Status | Meaning |
| --- | --- |
| Healthy | Recent successful probe and within configured thresholds |
| Degraded | Probe succeeds but latency/error thresholds are exceeded |
| Down | Repeated confirmed failures within the configured evaluation window |
| Auth expired | The probe cannot authenticate; service health is unknown |
| Stale | Last measurement is older than the freshness policy |
| Unknown | No trustworthy measurement is available |

Thresholds and evaluation windows must be configured from monitoring policy; do not invent them in the UI.

## Growth Overview integration

Add a compact reliability summary near the top of Growth Overview:
- Overall status.
- Active incident count.
- Most important affected workflow.
- Last successful check.
- One route to System Reliability.

Only surface actionable incidents. Do not duplicate the full endpoint table on the overview.

## Acceptance checks

- A 504 is visible as a timeout with timestamp, endpoint, and evidence.
- Authenticated endpoints show auth status separately from service status.
- Expired credentials never appear as a service outage without qualification.
- Missing/stale monitoring data never renders as Healthy.
- Every status has a textual label and an investigation path.
- The overview card and detail page use the same incident/status semantics.
