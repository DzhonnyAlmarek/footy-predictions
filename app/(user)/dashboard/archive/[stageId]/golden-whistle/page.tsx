import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GoldenWhistleStage from "@/app/_components/golden-whistle-stage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ArchiveGoldenWhistlePage({ params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  const sid = Number(stageId);
  if (!Number.isFinite(sid)) redirect("/dashboard/archive");
  const supabase = await createClient();
  const { data: stage } = await supabase.from("stages").select("id,name,status").eq("id", sid).maybeSingle();
  if (!stage || stage.status !== "locked") redirect("/dashboard/archive");
  return <GoldenWhistleStage stageId={sid} stageName={String(stage.name)} stageStatus="завершён" backHref={`/dashboard/archive/${sid}`} />;
}
