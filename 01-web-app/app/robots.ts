import type { MetadataRoute } from 'next';

/** Assessment demo, already `noindex` in the layout metadata. Say the same thing to crawlers. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
