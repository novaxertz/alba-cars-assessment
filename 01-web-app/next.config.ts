import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // PageSpeed flagged a render-blocking stylesheet: the browser parses the HTML, finds
    // the <link>, and cannot paint until that round trip finishes. The whole stylesheet is
    // 6.6KB of Tailwind, which is the case the Next docs name as worth inlining - atomic
    // CSS stays small no matter how much UI is built on it. Inlined, the styles arrive
    // with the HTML and the render-blocking request disappears.
    //
    // The trade is that returning visitors re-download it instead of using a cached file.
    // For a demo people open once, on a phone, the first paint is the thing worth buying.
    inlineCss: true,
  },
};

export default nextConfig;
