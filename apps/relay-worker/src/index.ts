/**
 * Both live relays, on Cloudflare Workers.
 *
 * They moved here for two reasons. The Python originals run in Render's Oregon
 * region, which puts ~415ms of round trip into every audio frame for Indian
 * users; a Worker runs at the edge nearest the caller. And Render bills every
 * forwarded byte as egress — 20.5 MB per five-minute call — while Cloudflare
 * charges nothing for bandwidth.
 *
 *   /ws/session    practice calls  (Gemini key 1)   -> session.ts
 *   /ws/assistant  Bixy            (Gemini key 2)   -> assistant.ts
 *
 * Auth happens before the socket is accepted: the signed ticket is the primary
 * gate, the origin check is defence in depth against cross-site WebSocket
 * hijacking. See README.md for what is deliberately not ported.
 */
import { assistantRelay } from './assistant.ts';
import { httpRoutes } from './http.ts';
import { sessionRelay } from './session.ts';
import { originAllowed, verifyTicket } from './shared.ts';
import type { Env } from './shared.ts';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') return new Response('ok');

    // Ported Python endpoints. Returns null for anything it does not own.
    const http = await httpRoutes(request, env, url.pathname);
    if (http) return http;

    const isSession = url.pathname === '/ws/session';
    const isAssistant = url.pathname === '/ws/assistant';
    if (!isSession && !isAssistant) return new Response('not found', { status: 404 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const ticket = await verifyTicket(url.searchParams.get('ticket') ?? '', env.WS_TICKET_SECRET);
    if (!ticket) return new Response('unauthorized', { status: 401 });
    if (!originAllowed(request.headers.get('Origin'), env.CORS_ORIGINS)) {
      return new Response('forbidden origin', { status: 403 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    // Runs after the 101 goes back, so the browser is never kept waiting on
    // Gemini's handshake.
    if (isSession) {
      const raw = url.searchParams.get('lang') ?? 'en';
      const lang = (raw.match(/[a-zA-Z-]/g) ?? []).join('').toLowerCase().slice(0, 8) || 'en';
      ctx.waitUntil(sessionRelay(server, env, ticket, lang, ctx));
    } else {
      ctx.waitUntil(assistantRelay(server, env, ticket, ctx));
    }

    return new Response(null, { status: 101, webSocket: client });
  },
};
