import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server client for Server Components, Server Actions and Route Handlers.
 *
 * Note the `await cookies()`: Next.js 16 removed synchronous access to request APIs,
 * so this factory has to be async. It still uses the anon key and the caller's session,
 * never the service_role key — server code is not a reason to bypass the boundary the
 * database enforces.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, which cannot set cookies. The session
            // refresh in proxy.ts covers this case.
          }
        },
      },
    },
  );
}
