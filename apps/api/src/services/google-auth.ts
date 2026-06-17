import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/**
 * Verify a Google ID token (credential) returned by Google Identity Services on
 * the frontend, and return the verified profile. Throws if invalid.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!config.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google token payload');
  }
  if (payload.email_verified === false) {
    throw new Error('Google email is not verified');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
