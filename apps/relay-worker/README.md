# speakcoach-relay

The live-session audio relay, on Cloudflare Workers. A port of
`apps/ai-service/src/routes/session.py`.

## Why this exists

Two measured problems with the Python relay on Render:

- **Latency.** Render runs it in Oregon (no `region` is set in `render.yaml`, so
  that is the default). Measured from Mumbai, a trivial request to it takes
  **315–881ms**, median ~415ms, against ~84ms to the Cloudflare edge. That round
  trip is paid on *every audio frame in both directions*, which puts the
  conversational turn at roughly 650ms — worse than LiveKit (~450ms) and Pipecat
  (~300ms), and past the ~300ms where a conversation starts to feel broken.
- **Bandwidth.** Audio flows browser → relay → Google → relay → browser as
  base64 PCM: **20.5 MB of billable egress per 5-minute call**. Render meters
  bandwidth per *workspace* (Hobby 5 GB, Pro 25 GB), so the free plan covers
  about 244 full-length calls a month. Cloudflare charges nothing for egress.

A Worker runs at the edge nearest the caller and is billed on CPU, not
wall-clock — and a relay is almost entirely waiting on the network, which does
not count. Expect ~$5/month flat.

## What is NOT ported

Deliberate, and each one is a decision rather than an oversight:

| | Why |
|---|---|
| **Body-language video frames** | Camera is off by default. Frames are large and go to Gemini Flash over HTTP, not the live socket. Left on the Python service. |
| **Native-audio language routing** | `core/live_routing.py` is a generated table deciding which languages get `gemini-2.5-flash-native-audio` instead of flash-live. Everyone gets flash-live here. Port the table before moving Hindi/English traffic if native audio matters. |
| **One-socket-per-session guard** | `_ACTIVE_SESSIONS` is in-process. Workers are many isolates, so this needs a Durable Object. Until then a second socket for the same session is not refused — the ticket is still required, single-use and short-lived, so this is a downgrade in hijack defence, not a hole. |
| **Bixy (`/ws/assistant`)** | Same pattern, separate route. Port after this one proves out. |

## Setup

```bash
cd apps/relay-worker
pnpm install
wrangler secret put GEMINI_API_KEY      # same key the Python relay uses
wrangler secret put WS_TICKET_SECRET    # MUST equal the API gateway's
wrangler secret put INTERNAL_API_KEY    # MUST equal the gateway's
wrangler deploy
```

`WS_TICKET_SECRET` is the one that silently breaks everything if it differs by a
byte — every connection is rejected with 401 and nothing says why.
`test/ticket.test.mjs` proves this Worker's WebCrypto verify agrees with the
gateway's `node:crypto` minting, including the base64url cases plain base64
mangles. Run it if you touch either side.

## Cutover

The Worker is a drop-in for the relay URL, so switch by changing what
`POST /api/sessions/:id/ticket` returns as `wsUrl` — nothing in the browser
changes. Keep the Render relay running and flip a single env var, so a bad
deploy is one variable away from being undone.

Verify in this order:
1. `GET /health` on the Worker returns `ok`.
2. One real call end to end: audio both ways, transcripts landing in
   `session_transcripts`, `call_ended` firing when the customer hangs up.
3. Compare the `call.cost` log line against the same scenario on the Python
   relay. Token counts should match; the Worker has no egress line because
   there is no egress charge.

## Cost metering

Every call logs one `call.cost` line with Gemini's own `usageMetadata`, broken
down by modality and priced in rupees. Counts are cumulative per session, so
they are absorbed with `max()` — summing would bill a call once per message that
reports usage. This mirrors `apps/ai-service/src/core/meter.py`; keep the two in
step, or the numbers will quietly disagree.
