import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session on every request and keeps signed-out visitors off
 * the dashboard.
 *
 * Named `proxy`, not `middleware`: Next.js 16 renamed the convention.
 *
 * This is a convenience redirect, not the security boundary. Even if this file were
 * deleted, row-level security would still prevent one dealer reading another's rows —
 * which is the point of enforcing ownership in the database rather than in the router.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith('/sign-in');

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // robots.txt and llms.txt are excluded deliberately. The proxy matched them, so a
  // crawler asking for a plain-text file got a 307 to /sign-in and an HTML page back -
  // which Lighthouse read as an invalid robots.txt and a malformed llms.txt. A catch-all
  // redirect answers every request; that is not the same as answering it correctly.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|llms.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
