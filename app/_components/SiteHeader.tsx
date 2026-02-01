import Link from "next/link";

export default function SiteHeader() {
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
