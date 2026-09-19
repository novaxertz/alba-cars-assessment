import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // See 01-web-app/next.config.ts: 6.6KB of Tailwind inlined into the HTML removes the
    // render-blocking stylesheet request. Returning visitors lose the cached file, which
    // is the right trade for a first paint on a phone.
    inlineCss: true,
    serverActions: {
      // Next caps Server Action bodies at 1MB by default, and a photo upload is a
      // Server Action. The browser downscales before sending (see components/Photos.tsx)
      // so nothing near this should arrive, but the default is low enough that a single
      // phone photo is rejected before any of our code runs - the client just sees an
      // "unexpected response", with nothing in the server logs because no function was
      // ever invoked. Vercel caps request bodies around 4.5MB regardless, which is the
      // real ceiling.
      bodySizeLimit: '4mb',
    },
  },
  /* config options here */
};

export default nextConfig;
