import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function tgSendMessage(text: string) {
  const token = mustEnv("TELEGRAM_BOT_TOKEN");
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
}

export async function POST(req: Request) {
  // простая защита для cron
  const auth = req.headers.get("authorization") ?? "";
  const secret = mustEnv("CRON_SECRET");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // TODO: тут можно подставить реальную логику (какие матчи скоро)
  const text =
    `⚽ <b>Напоминание</b>\n` +
    `Проверьте прогнозы на ближайшие матчи.\n` +
    `Открыть: /dashboard`;

  await tgSendMessage(text);

  return NextResponse.json({ ok: true });
}