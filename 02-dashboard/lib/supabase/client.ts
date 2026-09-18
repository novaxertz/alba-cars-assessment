'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client. Carries the anon key, which is safe to ship: it grants no privilege
 * on its own. Row-level security is what actually protects the data — see
 * supabase/migrations/0001_init.sql and scripts/verify-rls.mjs.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
