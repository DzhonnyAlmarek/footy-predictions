"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Team = { id: number; name: string; slug: string };

function slugifyRu(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-z0-9а-я\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function TeamsEditor({ initialTeams }: { initialTeams: Team[] }) {
  const router = useRouter();

  const [teams, setTeams] = useState<Team[]>(initialTeams);

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    setMsg(null);

    const name = newName.trim();
    if (!name) return setMsg("Введите название команды");

    const slug = newSlug.trim() || slugifyRu(name);
    if (!slug) return setMsg("Введите slug");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        const details = json?.message ? ` — ${json.message}` : "";
        throw new Error(`${json?.error ?? `Ошибка создания (${res.status})`}${details}`);
      }

      const team = json.team as Team;

      setTeams((prev) =>
        [...prev, team].sort((a, b) => a.name.localeCompare(b.name, "ru"))
      );

      setNewName("");
      setNewSlug("");
      setMsg("Команда создана ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка создания команды");
    } finally {
      setLoading(false);
    }
  }

  async function save(t: Team) {
    setMsg(null);

    const name = t.name.trim();
    const slug = t.slug.trim();

    if (!name || !slug) return setMsg("name/slug не могут быть пустыми");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, name, slug }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        const details = json?.message ? ` — ${json.message}` : "";
        throw new Error(`${json?.error ?? `Ошибка сохранения (${res.status})`}${details}`);
      }

      const updated = json.team as Team;

      setTeams((prev) =>
        prev
          .map((x) => (x.id === updated.id ? updated : x))
          .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      );

      router.refresh();
      setMsg("Сохранено ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: number) {
    setMsg(null);

    if (!confirm("Удалить команду? (если она уже использована в матчах — удаление может быть запрещено)")) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        const details = json?.message ? ` — ${json.message}` : "";
        throw new Error(`${json?.error ?? `Ошибка удаления (${res.status})`}${details}`);
      }

      setTeams((prev) => prev.filter((x) => x.id !== id));
      setMsg("Удалено ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  function updateLocal(id: number, patch: Partial<Team>) {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Новая команда</div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            if (!newSlug) setNewSlug(slugifyRu(e.target.value));
          }}
          placeholder="Название"
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 260 }}
        />

        <input
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          placeholder="slug"
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
        />

        <button
          type="button"
          onClick={create}
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "..." : "Создать"}
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        {teams.map((t) => (
          <div
            key={t.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 12,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={t.name}
                onChange={(e) => updateLocal(t.id, { name: e.target.value })}
                disabled={loading}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 260 }}
              />

              <input
                value={t.slug}
                onChange={(e) => updateLocal(t.id, { slug: e.target.value })}
                disabled={loading}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => save(t)}
                disabled={loading}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Сохранить
              </button>

              <button
                type="button"
                onClick={() => remove(t.id)}
                disabled={loading}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}