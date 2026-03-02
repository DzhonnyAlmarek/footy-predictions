import Link from "next/link";

export default function AdminNav({ loginLabel }: { loginLabel: string }) {
  return (
    <div className="adminNav">
      <div className="adminNavLabel">
        Вы вошли как
        <div className="adminNavUser">{loginLabel}</div>
      </div>

      <div className="adminNavLinks">
        <Link className="adminNavLink" href="/admin">
          🏠 Админ-панель
        </Link>

        <Link className="adminNavLink" href="/admin/telegram-test">
          🧪 Telegram тест
        </Link>

        <Link className="adminNavLink" href="/admin/backups">
          💾 Бэкапы
        </Link>

        <a className="adminNavLink" href="/logout">
          🚪 Выйти
        </a>
      </div>
    </div>
  );
}