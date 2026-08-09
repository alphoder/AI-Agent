import { createClerkClient, verifyToken } from '@clerk/backend';
import type { ClerkProfile } from './user-service';

/**
 * Clerk sign-in verification. Mirrors `google-auth.ts`: take the provider's
 * token, prove it is real, hand back a plain profile. Everything downstream
 * (our own RS256 JWT, refresh rotation, WS tickets) is unchanged — Clerk only
 * ever proves identity, it never becomes the session.
 *
 * A Clerk session token carries no email claim by default, so the verified
 * `sub` is looked up through the Clerk API for the address and avatar.
 */
const secretKey = process.env.CLERK_SECRET_KEY || '';

export function clerkEnabled(): boolean {
  return secretKey.length > 0;
}

let client: ReturnType<typeof createClerkClient> | null = null;
function clerk() {
  if (!client) client = createClerkClient({ secretKey });
  return client;
}

export async function verifyClerkSessionToken(token: string): Promise<ClerkProfile> {
  const claims = await verifyToken(token, { secretKey });
  const userId = claims.sub;
  if (!userId) throw new Error('Clerk token has no subject');

  const user = await clerk().users.getUser(userId);
  const email =
    user.primaryEmailAddressId &&
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
  if (!email) throw new Error('Clerk user has no primary email address');

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return { email: email.toLowerCase(), name: name || null, picture: user.imageUrl || null };
}
