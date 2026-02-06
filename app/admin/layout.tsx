import { redirect } from "next/navigation";
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
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();

  if (fpLogin !== "ADMIN") redirect("/");

  return (
    <div className="adminShell">
      <aside className="adminSide">
        <AdminNav loginLabel={fpLogin} />
      </aside>

      <div className="adminMain">{children}</div>
    </div>
  );
}
