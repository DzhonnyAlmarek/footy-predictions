import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GoldenWhistleStage from "@/app/_components/golden-whistle-stage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GoldenWhistlePage() {
  const supabase = await createClient();
  const { data: stage } = await supabase.from("stages").select("id,name,status").eq("is_current", true).maybeSingle();
  if (!stage) redirect("/dashboard");
  return <GoldenWhistleStage stageId={Number(stage.id)} stageName={String(stage.name)} stageStatus={stage.status} backHref="/dashboard/current" />;
}
