import Link from "next/link";

export default async function AdminPage() {
  // AdminLayout уже проверяет: залогинен, сменил пароль, role=admin
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Админ-панель</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Выберите раздел</p>

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
            Создание, редактирование, удаление. Закрытие этапа только при 56 матчах.
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
          <div style={{ fontWeight: 900, fontSize: 18 }}>Результаты</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Ввод результатов и автоматическое начисление очков
          </div>
        </Link>

        <Link
          href="/admin/teams"
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Команды</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Создать / редактировать / удалить команды
          </div>
        </Link>

        <Link
          href="/admin/users"
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            color: "inherit",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Пользователи</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Создать / редактировать / удалить пользователей, сброс пароля
          </div>
        </Link>
      </section>
    </main>
  );
}
