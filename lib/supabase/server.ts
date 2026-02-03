import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  // сюда Supabase будет складывать cookies, которые нужно выставить в ответ
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          pending.push(...cookiesToSet);
        },
      },
    }
  );

  // применяем cookies к любому NextResponse с сохранением options
  function applyCookies(res: { cookies: { set: (name: string, value: string, options?: any) => void } }) {
    pending.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, { ...options, path: "/" });
    });
  }

  return { supabase, applyCookies };
}

// Alias под старые импорты
export async function createClient() {
  const { supabase } = await createSupabaseServerClient();
  return supabase;
}
