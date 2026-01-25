import { createClient } from "@/lib/supabase/server";
import TeamsEditor from "./teams-editor";

export default async function AdminTeamsPage() {
  const supabase = await createClient();

  const { data: teams, error } = await supabase
    .from("teams")
    .select("id,name,slug")
    .order("name", { ascending: true });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Команды</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>Создание / редактирование / удаление</p>
      </header>

      {error && <p style={{ marginTop: 16, color: "crimson" }}>Ошибка: {error.message}</p>}

      <section style={{ marginTop: 18 }}>
        <TeamsEditor initialTeams={(teams ?? []) as any} />
      </section>
    </main>
  );
}
