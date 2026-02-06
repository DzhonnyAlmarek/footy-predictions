import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="siteHeader">
      <div className="siteHeaderInner">
        <Link href="/" className="clubTitleLink" aria-label="На главную">
          <span className="clubIcon" aria-hidden="true">
            ⚽
          </span>
          <span className="clubTitleText">
            Клуб <span>им. А.Н. Мурашева</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
