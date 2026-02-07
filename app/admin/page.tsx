import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function Tile(props: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={props.href}
      style={{
        border: "1px solid rgba(17,24,39,.12)",
        borderRadius: 16,
        padding: 16,
        display: "block",
        textDecoration: "none",
        background: "#fff",
        boxShadow: "0 10px 30px rgba(17,24,39,.06)",
        color: "var(--text)",
      }}
    >
      <div style={{ fontWeight: 950, fontSize: 18, letterSpacing: "-0.02em" }}>
        {props.title}
      </div>
      <div style={{ marginTop: 6, opacity: 0.7, fontWeight: 800 }}>
        {props.desc}
      </div>
    </Link>
  );
}

export default async function AdminHomePage() {
  return (
    <main className="page">
      <h1 style={{ fontSize: 34, fontWeight: 950, margin: "8px 0 0" }}>
        Админ-панель
      </h1>
      <div className="pageMeta">Выберите раздел</div>

      <div style={{ marginTop: 16, display: "grid", gap: 14, maxWidth: 920 }}>
        <Tile
          href="/admin/current-table"
          title="Текущая таблица"
          desc="Этап → матчи + прогнозы участников"
        />
        <Tile
          href="/admin/stages"
          title="Этапы / Туры / Матчи"
          desc="Создание, редактирование, удаление"
        />
        <Tile
          href="/admin/results"
          title="Результаты"
          desc="Ввод результатов и начисление очков"
        />
        <Tile
          href="/admin/teams"
          title="Команды"
          desc="Создать / редактировать / удалить команды"
        />
        <Tile
          href="/admin/users"
          title="Пользователи"
          desc="Создать / редактировать / удалить пользователей, сброс пароля"
        />
      </div>
    </main>
  );
}
