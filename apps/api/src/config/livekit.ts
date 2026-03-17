import { config } from './env';

export const livekitConfig = {
  apiKey: config.LIVEKIT_API_KEY,
  apiSecret: config.LIVEKIT_API_SECRET,
  url: config.LIVEKIT_URL,
};
