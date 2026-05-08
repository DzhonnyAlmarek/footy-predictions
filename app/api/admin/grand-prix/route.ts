import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

function slugifySeasonName(name: string) {
  const found = name.match(/\d{4}\s*[–-]\s*\d{4}/);
  if (found?.[0]) {
    return found[0].replace(/\s+/g, "").replace("–", "-");
  }

  return name
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: Request) {
  try {
    const cs = await cookies();
    const login = decodeMaybe(cs.get("fp_login")?.value ?? "")
      .trim()
      .toUpperCase();

    if (login !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "admin_only" },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const action = String(form.get("action") ?? "");

    const sb = service();

    if (action === "createSeason") {
      const name = String(form.get("name") ?? "").trim();
      const slugRaw = String(form.get("slug") ?? "").trim();
      const slug = slugRaw || slugifySeasonName(name);

      if (!name || !slug) {
        return NextResponse.json(
          { ok: false, error: "season_name_required" },
          { status: 400 }
        );
      }

      const { data: season, error: seasonError } = await sb
        .from("grand_prix_seasons")
        .insert({ name, slug })
        .select("id,slug")
        .single();

      if (seasonError) {
        return NextResponse.json(
          { ok: false, error: seasonError.message },
          { status: 500 }
        );
      }

      const rounds = Array.from({ length: 5 }, (_, i) => ({
        season_id: season.id,
        round_no: i + 1,
        name: `Этап ${i + 1}`,
        source_type: "manual",
        stage_id: null,
      }));

      const { error: roundsError } = await sb
        .from("grand_prix_rounds")
        .insert(rounds);

      if (roundsError) {
        return NextResponse.json(
          { ok: false, error: roundsError.message },
          { status: 500 }
        );
      }

      return NextResponse.redirect(
        new URL(`/admin/grand-prix?season=${season.slug}`, req.url)
      );
    }

    if (action === "saveManualScore") {
      const roundId = Number(form.get("roundId"));
      const userId = String(form.get("userId") ?? "");
      const points = Number(form.get("points") ?? 0);
      const seasonSlug = String(form.get("seasonSlug") ?? "2025-2026");

      if (!roundId || !userId) {
        return NextResponse.json(
          { ok: false, error: "bad_request" },
          { status: 400 }
        );
      }

      const { error } = await sb
        .from("grand_prix_manual_scores")
        .upsert(
          {
            round_id: roundId,
            user_id: userId,
            points,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "round_id,user_id" }
        );

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.redirect(
        new URL(`/admin/grand-prix?season=${seasonSlug}`, req.url)
      );
    }

    if (action === "updateRoundSource") {
      const roundId = Number(form.get("roundId"));
      const sourceType = String(form.get("sourceType") ?? "manual");
      const stageIdRaw = String(form.get("stageId") ?? "");
      const seasonSlug = String(form.get("seasonSlug") ?? "2025-2026");

      if (!roundId || !["manual", "stage"].includes(sourceType)) {
        return NextResponse.json(
          { ok: false, error: "bad_request" },
          { status: 400 }
        );
      }

      const stageId =
        sourceType === "stage" && stageIdRaw ? Number(stageIdRaw) : null;

      const { error } = await sb
        .from("grand_prix_rounds")
        .update({
          source_type: sourceType,
          stage_id: stageId,
        })
        .eq("id", roundId);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.redirect(
        new URL(`/admin/grand-prix?season=${seasonSlug}`, req.url)
      );
    }

    return NextResponse.json(
      { ok: false, error: "unknown_action" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "server_error" },
      { status: 500 }
    );
  }
}