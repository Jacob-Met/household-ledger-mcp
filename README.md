# Household Ledger MCP

TypeScript service for recording household income and expenses, listing/filtering transactions, monthly summaries, and category budgets. It uses the official typed `@modelcontextprotocol/sdk` and implements **MCP 2025-11-25 over Streamable HTTP** at `/mcp`. Amounts are integer minor units; the data file is validated and atomically persisted as local JSON.

## Run locally

- Node.js 20+
- `npm ci`
- `npm run typecheck`
- `npm test`
- `HOUSEHOLD_LEDGER_DATA_PATH="$HOME/.local/share/household-ledger/ledger.json" npm start`

By default the Streamable HTTP service binds only to `127.0.0.1:3000`, with `GET /healthz` as a local health check. It intentionally rejects non-loopback binds until authentication and deployment controls are implemented. Set `HOUSEHOLD_LEDGER_PORT` to change the port. `npm run start:stdio` remains available for local process-spawned development only.

## Competition readiness

This is an unsubmitted local prototype. Source repository: https://github.com/Jacob-Met/household-ledger-mcp (public; MIT License). It is not onboarded to Alexa+: it has no public HTTPS endpoint, OAuth 2.1/PKCE, Protected Resource Metadata, privacy/terms URLs, Alexa add-on manifest, certification, or demo video. This task did not register or join a Devpost account, and no entry was submitted; existing Devpost identity/join state remains unverified. Do not expose this unauthenticated loopback server to the network.
