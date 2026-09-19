import type { MetadataRoute } from 'next';

/**
 * The sign-in page is the only thing a crawler can reach: everything behind it is
 * gated by the auth proxy and, underneath that, by RLS. So the door is crawlable and
 * the rest is not.
 *
 * robots.txt is not a security boundary and is not doing any work here — the proxy and
 * the row-level policies are. This file exists because Lighthouse read `/robots.txt` as
 * invalid: the proxy was matching it, so a crawler asking for a plain-text file got a
 * 307 to `/sign-in` and an HTML page. The path is now excluded from the proxy matcher.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/sign-in', disallow: '/' } };
}
