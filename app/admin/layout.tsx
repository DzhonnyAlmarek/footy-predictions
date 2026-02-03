import AdminNav from "./AdminNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
          <aside className="md:sticky md:top-4 self-start">
            <div className="rounded-2xl border p-3 shadow-sm">
              <AdminNav loginLabel="ADMIN" />
            </div>
          </aside>

          <main className="rounded-2xl border p-4 shadow-sm">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
