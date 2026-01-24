"use client";

export default function BackButton({ label = "Вернуться" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #111",
        background: "#fff",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
