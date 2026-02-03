import AdminNav from "./AdminNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <AdminNav loginLabel="ADMIN" />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
