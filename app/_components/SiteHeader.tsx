"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();

  // ✅ на /admin (и вложенных) не показываем общий хедер
  if (pathname?.startsWith("/admin")) return null;

  return (
    <div className="siteTitleWrap">
      <Link href="/" className="clubTitleLink" aria-label="На главную">
        <span className="clubIcon" aria-hidden="true">⚽</span>
        <span className="clubTitleText">
          Клуб <span>им. А.Н. Мурашева</span>
        </span>
      </Link>
    </div>
  );
}
