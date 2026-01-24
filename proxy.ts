import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  // Сбрасываем сессию ТОЛЬКО на главной странице
  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  const res = NextResponse.next();

  // Удаляем все cookies, которые похожи на supabase auth (sb-*)
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-") || c.name.includes("supabase")) {
      res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    }
  }

  return res;
}

// Важно: применяем middleware только к "/"
export const config = {
  matcher: ["/"],
};
