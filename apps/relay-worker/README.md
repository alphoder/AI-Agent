# speakcoach-relay

Both live WebSocket relays, on Cloudflare Workers.

| Route | What | Gemini key |
|---|---|---|
| `/ws/session` | practice calls | key 1 (`GEMINI_API_KEY`) |
| `/ws/assistant` | Bixy | key 2 (`GEMINI_PROMPT_API_KEY`) |
| `/health` | liveness | — |

## Why it exists

The Python originals run in Render's Oregon region — no region is set in
`render.yaml`, and Oregon is the default. Measured from Mumbai that is 315–881ms
to a trivial endpoint, paid on every audio frame in both directions. The same
path bills 20.5 MB of egress per five-minute call, metered per Render workspace
(Hobby 5 GB, Pro 25 GB), which is ~244 full-length calls a month on the free
plan. Cloudflare charges nothing for bandwidth and bills CPU rather than
wall-clock, and a relay is almost entirely waiting on the network.

## Not ported, deliberately

- **Body-language video frames.** Camera is off by default; stays on Python.
- **Native-audio language routing.** Everyone gets flash-live. Port
  `live_routing.py` before moving Hindi traffic if native audio matters.
- **One-socket-per-session guard.** Needs a Durable Object, because each request
  may land in a different isolate. The ticket is still single-use and
  short-lived, so this is a weaker hijack defence, not an absent one.
- **`/metrics`.** Cloudflare's own observability replaces the Prometheus scrape.
  Cost still lands in the logs as a `call.cost` line per call.

## Deploy

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GEMINI_PROMPT_API_KEY
npx wrangler secret put WS_TICKET_SECRET     # MUST match the API gateway
npx wrangler secret put INTERNAL_API_KEY     # MUST match the API gateway
npx wrangler deploy
```

Then on the API gateway set `RELAY_WS_URL` to the Worker's URL. Unset it to roll
back — the Python relays take both sockets again with no redeploy.

Requires the **Workers Paid** plan: the free tier caps CPU at 10ms per
invocation, and a five-minute call is one invocation across thousands of
messages.

## Tests

```bash
node --test test/ticket.test.mjs
```

A one-byte disagreement with the gateway's HMAC rejects every connection and
logs nothing useful, so the test signs with the gateway's own code path and
verifies with the Worker's WebCrypto one.
