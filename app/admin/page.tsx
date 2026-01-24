import Link from "next/link";

export default async function AdminPage() {
  // AdminLayout уже проверяет: залогинен, сменил пароль, role=admin
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Админ-панель</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Выберите раздел
      </p>

      <section style={{ marginTop: 18, display: "grid", gap: 12 }}>
        <Link
          href="/admin/current-table"
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Текущая таблица</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Этап → туры → матчи + прогнозы участников
          </div>
        </Link>

        <Link
          href="/admin/stages"
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Этапы / Туры / Матчи</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Создание, редактирование, удаление. Публикация при 56 матчах.
          </div>
        </Link>

        <Link
          href="/admin/results"
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Результаты и начисление</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Ввод счёта и “Начислить очки”
          </div>
        </Link>

        <Link
          href="/admin/audit"
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Логи</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Audit log действий админа
          </div>
        </Link>

        <Link
          href="/leaderboard"
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Лидерборд</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Публичная таблица очков
          </div>
        </Link>
      </section>
    </main>
  );
}
