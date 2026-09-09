const stageStatuses: Record<string, string> = {
  draft: "черновик",
  published: "опубликован",
  locked: "завершён",
};

const matchStatuses: Record<string, string> = {
  scheduled: "запланирован",
  live: "идёт",
  in_progress: "идёт",
  finished: "завершён",
  postponed: "перенесён",
  cancelled: "отменён",
};

export function stageStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return stageStatuses[status] ?? status;
}

export function matchStatusLabel(status: string | null | undefined): string {
  if (!status) return "не указан";
  return matchStatuses[status] ?? status;
}

export function pointsReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "";
  if (reason === "prediction") return "прогноз";
  return reason;
}
