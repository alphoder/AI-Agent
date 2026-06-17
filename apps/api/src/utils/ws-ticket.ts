import crypto from 'crypto';
import { config } from '../config/env';

/**
 * Short-lived, signed ticket that authorises a single WebSocket connection.
 * Compact HMAC token: base64url(payload) "." base64url(HMAC-SHA256(secret, payload)).
 * The AI service verifies it before accepting /ws/session — without a valid,
 * unexpired ticket bound to (session, user), no socket is allowed in.
 */
const SECRET = config.WS_TICKET_SECRET || config.INTERNAL_API_KEY;
const DEFAULT_TTL_SEC = 120;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function signWsTicket(sessionId: string, userId: string, ttlSec = DEFAULT_TTL_SEC): string {
  const payload = b64url(
    Buffer.from(JSON.stringify({ sid: sessionId, uid: userId, exp: Math.floor(Date.now() / 1000) + ttlSec })),
  );
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}
