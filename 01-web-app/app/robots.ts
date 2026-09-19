import type { MetadataRoute } from 'next';

/**
 * A public demo with nothing private in it, so: valid, and crawlable.
 *
 * This file exists because Lighthouse reads a missing robots.txt as a 404 and a
 * disallow-all one as "page is blocked from indexing" — the first attempt here shipped
 * `Disallow: /` and dropped the SEO score from 100 to 63. Blocking crawlers was never the
 * goal; having a valid file was.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' } };
}
