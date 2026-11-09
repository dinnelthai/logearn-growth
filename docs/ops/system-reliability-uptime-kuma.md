# System Reliability — Uptime Kuma integration

## Architecture

- Uptime Kuma executes the HTTP(s), TCP, DNS, and RPC probes.
- LogEarn Growth reads Uptime Kuma's published Status Page data through the server-side bridge at GET /api/system-reliability/overview.
- The browser never receives Uptime Kuma credentials or monitored endpoint URLs.
- Monitor creation and credential management remain in Uptime Kuma. LogEarn intentionally does not automate Uptime Kuma's internal Socket.IO API because that API is not a stable third-party integration contract.
- The LogEarn System Reliability page also displays the current backend process uptime and memory snapshot.

## Deploy Uptime Kuma

For local development, one simple Docker command is:

~~~bash
docker run -d \
  --name uptime-kuma \
  --restart unless-stopped \
  -p 3002:3001 \
  -v uptime-kuma:/app/data \
  louislam/uptime-kuma:2
~~~

The host port is 3002 so it does not conflict with a local LogEarn backend using port 3001.

Open Uptime Kuma, create the administrator account, and add the monitors you want to observe. Then create a Status Page, add the monitors to public groups, and publish it. Copy the page slug.

## Configure LogEarn backend

Add these settings to the backend environment and restart the backend:

~~~dotenv
UPTIME_KUMA_BASE_URL=http://127.0.0.1:3002
UPTIME_KUMA_STATUS_SLUG=logearn-prod
UPTIME_KUMA_STATUS_PAGE_TIMEOUT_MS=8000
~~~

For production, prefer an HTTPS reverse-proxy URL:

~~~dotenv
UPTIME_KUMA_BASE_URL=https://status.example.com
UPTIME_KUMA_STATUS_SLUG=logearn-prod
UPTIME_KUMA_BASIC_AUTH_USER=logearn-status-reader
UPTIME_KUMA_BASIC_AUTH_PASSWORD=<strong-random-password>
~~~

If the backend and Uptime Kuma communicate over a trusted private Docker network, plain HTTP can be explicitly enabled with UPTIME_KUMA_ALLOW_HTTP=true. Do not use plain HTTP over an untrusted network.

Published Status Page data endpoints are public by default. If the status page must remain internal, protect the Uptime Kuma host/path with Basic Auth at the reverse proxy and configure the two Basic Auth environment variables above. The LogEarn backend sends those credentials server-side only.

## Authenticated API probes

Yes — endpoints that require login can be monitored.

1. Create a dedicated read-only service account in LogEarn, not a personal administrator account.
2. In Uptime Kuma, create an HTTP(s) monitor for the authenticated GET endpoint.
3. In the monitor's Authentication section, choose Bearer Token and enter the service token. Uptime Kuma also supports custom request headers; use an Authorization header only when the monitor's auth configuration requires it.
4. Choose expected status codes and a sensible check interval (for example, 60–120 seconds).
5. Configure a notification provider in Uptime Kuma and assign it to the monitor so a down transition can trigger Telegram, Discord, Slack, or a webhook notification.
6. Never paste the token into LogEarn's frontend, a public Status Page description, or a shared document.

The token remains in Uptime Kuma's monitor configuration. LogEarn reads only the public monitor name, state, latest heartbeat, response time, and uptime summary. It does not receive the token or the target URL. Wallet-signature, CAPTCHA, or human MFA login flows need a dedicated service-token/OAuth2 path or a separate custom probe; a normal HTTP monitor cannot complete those interactive steps.

## Suggested LogEarn monitor groups

| Group | Suggested checks |
|---|---|
| Website | Homepage, static assets, public health endpoint |
| Authentication | Login endpoint, read-only authenticated profile or session check |
| Core API | Token detail, holder/chip distribution, strategy read endpoints |
| Data pipeline | Latest indexed token, holder snapshot freshness, data API |
| Trading | Read-only wallet status, quote endpoint, transaction status lookup |
| Chain / RPC | Solana health or slot, BSC block height, RPC latency |

Prefer read-only endpoints. Avoid monitoring order-creation, wallet-transfer, or other side-effecting operations with periodic probes. Uptime Kuma sends external notifications; the LogEarn dashboard also surfaces down monitors in its own attention strip.

## What the dashboard shows

- Overall state: up, degraded, warning, maintenance, or unknown.
- Monitor count, up/down count, and average latest response time.
- Per monitor: 24-hour uptime, latest response time, interval, last check, message, and recent heartbeat strip.
- Current pinned Status Page incident.
- LogEarn backend process uptime, RSS memory, heap usage, and Node version.

The page shows the time LogEarn read the status page and the timestamp of each monitor's last heartbeat. Actual freshness depends on the monitor interval and Uptime Kuma's Status Page caching.

## Security and operational boundaries

- The status page must be published for the public status-page data endpoints to work.
- The bridge rejects non-HTTPS Uptime Kuma URLs in production unless UPTIME_KUMA_ALLOW_HTTP=true is explicitly set for a trusted private network.
- The bridge follows no redirects, does not expose monitor URLs, and never returns Basic Auth credentials.
- If Uptime Kuma is unreachable, the dashboard distinguishes collector failure from an individual monitored service outage.
- Status-page data is for reliability observation, not a real-time trading signal.
