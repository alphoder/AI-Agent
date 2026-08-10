/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@avatar-platform/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  // The voice previews are served as `audio/wave`, which Chrome does not accept:
  // canPlayType('audio/wave') returns '' (cannot play) while 'audio/wav' and
  // 'audio/x-wav' both return 'maybe'. The bytes are fine — they decode through
  // decodeAudioData — but an <audio> element handed that type stalls at
  // readyState 0 and its play() promise never settles, so the picker's stop icon
  // never appears and the preview looks dead.
  async headers() {
    return [{
      source: '/voices/:file*.wav',
      headers: [{ key: 'Content-Type', value: 'audio/wav' }],
    }];
  },
};

module.exports = nextConfig;
