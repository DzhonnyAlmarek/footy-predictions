import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // делаем session-only
          const { maxAge, expires, ...rest } = options ?? {};
          cookieStore.set(name, value, rest);
        });
      },
    },
  });

  await supabase.auth.signOut();

  // Редиректим на главную (там middleware всё равно чистит cookies)
  const response = NextResponse.redirect(`${origin}/`);

  // Снимаем наш маркер доступа к внутренним страницам
  response.cookies.set("fp_auth", "", { maxAge: 0, path: "/" });

  // На всякий случай ещё раз чистим возможные supabase cookies
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-") || c.name.includes("supabase")) {
      response.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}
