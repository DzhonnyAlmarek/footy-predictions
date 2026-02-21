export const TZ_MSK = "Europe/Moscow";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Показ даты/времени в MSK (для таблиц/уведомлений) */
export function fmtRuDateTimeMSK(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    timeZone: TZ_MSK,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Только дата в MSK: YYYY-MM-DD (для input date) */
export function isoToDateValueMSK(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_MSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${day}`;
}

/** Для input datetime-local: YYYY-MM-DDTHH:mm в MSK */
export function isoToDateTimeLocalValueMSK(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_MSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";

  return `${y}-${m}-${day}T${hh}:${mm}`;
}

/**
 * Преобразует строку из datetime-local (интерпретируем как MSK) -> ISO UTC
 * input: "YYYY-MM-DDTHH:mm"
 */
export function dateTimeLocalMSKToIsoUtc(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // парсим компоненты
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);

  // MSK = UTC+3 (без перехода на летнее время)
  const utcMs = Date.UTC(year, month - 1, day, hour - 3, minute, 0, 0);
  return new Date(utcMs).toISOString();
}

/** Если нужно красиво в таблице: "ДД.ММ.ГГГГ, ЧЧ:ММ (МСК)" */
export function fmtRuDateTimeMSKLabel(iso?: string | null): string {
  const t = fmtRuDateTimeMSK(iso);
  return t === "—" ? t : `${t} (МСК)`;
}