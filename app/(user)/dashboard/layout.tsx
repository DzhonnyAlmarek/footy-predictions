import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // ВАЖНО:
  // Любые шапки/меню/статусы этапа НЕ рисуем здесь.
  // Единая шапка для user/admin должна быть в app/(user)/layout.tsx и app/admin/layout.tsx через AppHeader.
  return <>{children}</>;
}
