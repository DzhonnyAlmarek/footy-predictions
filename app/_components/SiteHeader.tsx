import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="siteHeader">
      <div
        className="siteHeaderInner"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Link
          href="/"
          className="clubTitleLink"
          aria-label="На главную"
        >
          <span className="clubIcon" aria-hidden="true">
            ⚽
          </span>

          <span className="clubTitleText">
            Клуб <span>им. А.Н. Мурашева</span>
          </span>
        </Link>

        <div
          style={{
            marginTop: 6,
            textAlign: "center",
            fontSize: 14,
            fontWeight: 500,
            opacity: 0.72,
          }}
        >
          Основан 6 июня 2008 года
        </div>
      </div>
    </header>
  );
}