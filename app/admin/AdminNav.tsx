import Link from "next/link";

export default function AdminNav({ loginLabel }: { loginLabel: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 900, fontSize: 14 }}>{loginLabel}</div>

      <Link
        href="/admin"
        style={{
          display: "inline-block",
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          textDecoration: "none",
          fontWeight: 800,
        }}
      >
        Домой
      </Link>
    </div>
  );
}
