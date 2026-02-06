import Link from "next/link";

export default function AdminNav({ loginLabel }: { loginLabel: string }) {
  return (
    <div className="adminNav">
      <div className="adminNavUser">
        <div className="adminNavUserLabel">Вы вошли как</div>
        <div className="adminNavUserValue">{loginLabel}</div>
      </div>

      <div className="adminNavButtons">
        <Link href="/admin" className="btn btnPrimary">
          Домой
        </Link>

        <a href="/logout" className="btn btnGhost">
          Выйти
        </a>
      </div>
    </div>
  );
}
