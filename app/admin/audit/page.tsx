import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminAuditPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div style={{ color: "crimson" }}>
        Ошибка загрузки аудита: {error.message}
      </div>
    );
  }

  return (
    <div>
      <h1>Аудит</h1>

      <div style={{ marginBottom: 16 }}>
        <Link href="/admin">← Назад</Link>
      </div>

      <table border={1} cellPadding={6}>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Пользователь</th>
            <th>Действие</th>
            <th>Детали</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((row: any) => (
            <tr key={row.id}>
              <td>{row.created_at}</td>
              <td>{row.login ?? "—"}</td>
              <td>{row.action}</td>
              <td>{row.details ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
