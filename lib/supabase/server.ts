import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type CookieToSet = {
  name: string;
  value: string;
  options?: any;
};

/**
 * Supabase Server Client для Next.js App Router (15+ / 16)
 * Возвращает { supabase, res } — res нужен, если надо прокинуть обновлённые cookies в ответ.
 */
export async function createSupabaseServerClient() {
  // Next 15+ / 16: cookies() async
  const cookieStore = await cookies();

  // Response-заглушка, в неё пишем cookies
  const res = NextResponse.next();

  const supabase = createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, {
              ...options,
              path: "/",
            });
          });
        },
      },
    }
  );

  return { supabase, res };
}

/**
 * ✅ Alias под старые импорты в проекте:
 * import { createClient } from "@/lib/supabase/server"
 */
export async function createClient() {
  const { supabase } = await createSupabaseServerClient();
  return supabase;
}
