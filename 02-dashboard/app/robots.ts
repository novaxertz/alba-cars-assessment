import type { MetadataRoute } from 'next';

/**
 * A private dealer dashboard has nothing to offer a crawler, and the demo data is
 * throwaway. Disallow everything.
 *
 * This exists because Lighthouse read `/robots.txt` as invalid: the auth proxy was
 * redirecting it to `/sign-in`, so crawlers were handed an HTML page where a plain-text
 * file belongs. The route is now excluded from the proxy matcher.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
