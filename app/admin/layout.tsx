import { cookies } from "next/headers";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cs = await cookies();
  const raw = cs.get("fp_login")?.value ?? "";
  const loginLabel = (decodeMaybe(raw) || "ADMIN").toString();

  return (
    <div className="adminLayout">
      <aside className="adminSidebar">
        <AdminNav loginLabel={loginLabel} />
      </aside>

      <div className="adminMain">
        <div className="adminTopbar">
          <div className="adminTitle">Админ-панель</div>
        </div>

        <main className="adminContent">{children}</main>
      </div>
    </div>
  );
}
