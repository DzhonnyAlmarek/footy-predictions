import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function Tile({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      style={{
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        padding: 16,
        display: "block",
        textDecoration: "none",
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
      <div style={{ marginTop: 6, opacity: 0.75 }}>{desc}</div>
    </Link>
  );
}

export default async function AdminHomePage() {
  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: "8px 0 0" }}>
        Админ-панель
      </h1>
      <div style={{ marginTop: 8, opacity: 0.75 }}>Выберите раздел</div>

      <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
        <Tile
          href="/admin/current-table"
          title="Текущая таблица"
          desc="Этап → туры → матчи + прогнозы участников"
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
    </div>
  );
}
