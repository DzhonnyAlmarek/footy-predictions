import Link from "next/link";

export default function SiteHeader() {
  return (
    <header
      style={{
        width: "100%",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        background: "#fff",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "14px 16px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Link
          href="/"
          aria-label="На главную"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "rgba(0,0,0,0.04)",
              fontSize: 18,
            }}
          >
            ⚽
          </span>

          <span
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.1,
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            Клуб
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              им. А.Н. Мурашева
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}
