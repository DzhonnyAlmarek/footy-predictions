import { createClient } from "@/lib/supabase/server";
import UsersEditor from "./users-editor";

type LoginAccRow = {
  user_id: string;
  login: string;
  must_change_password: boolean;
};

type ProfileRow = {
  id: string;
  username: string | null;
  role: string | null;
};

export default async function AdminUsersPage() {
  const supabase = await createClient();

  // 1) login_accounts
  const { data: accs, error: accErr } = await supabase
    .from("login_accounts")
    .select("user_id,login,must_change_password")
    .order("login", { ascending: true });

  if (accErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Пользователи</h1>
        <p style={{ marginTop: 16, color: "crimson" }}>Ошибка: {accErr.message}</p>
      </main>
    );
  }

  const rows = (accs ?? []) as LoginAccRow[];
  const userIds = rows.map((r) => r.user_id);

  // 2) profiles отдельным запросом
  let profMap = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id,username,role")
      .in("id", userIds);

    // если profiles по RLS не читаются — покажем ошибку
    if (pErr) {
      return (
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Пользователи</h1>
          <p style={{ marginTop: 16, color: "crimson" }}>Ошибка profiles: {pErr.message}</p>
        </main>
      );
    }

    for (const p of (profs ?? []) as ProfileRow[]) {
      profMap.set(p.id, p);
    }
  }

  const merged = rows.map((r) => {
    const p = profMap.get(r.user_id);
    return {
      user_id: r.user_id,
      login: r.login,
      must_change_password: r.must_change_password,
      profiles: p ? { role: p.role ?? "user", username: p.username ?? r.login } : { role: "user", username: r.login },
    };
  });

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Пользователи</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>Создание / редактирование / удаление</p>
      </header>

      <section style={{ marginTop: 18 }}>
        <UsersEditor initialRows={merged as any} />
      </section>
    </main>
  );
}
