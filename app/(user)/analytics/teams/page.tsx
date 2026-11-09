import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedLegacyLogin } from "@/lib/legacy-identity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { stage?: string; user?: string; order?: string };
type Props = { searchParams?: Promise<Params> };
type Match = { id: number; stage_id: number | null; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null; status: string; kickoff_at: string | null };
type Prediction = { match_id: number; user_id: string; home_pred: number; away_pred: number };
type Ledger = { match_id: number; user_id: string; points: number };
type Sample = { id: number; match: string; result: string; prediction: string; points: number; exact: boolean; outcome: boolean };
type TeamStat = { name: string; matches: Set<number>; points: number; count: number; outcomes: number; exact: number; samples: Sample[] };

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Не задано подключение к базе");
  return createClient(url, key, { auth: { persistSession: false } });
}
async function readPages<T>(fetcher: (from: number, to: number) => any): Promise<T[]> {
  const output: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetcher(from, from + 499);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    output.push(...rows);
    if (rows.length < 500) return output;
  }
}
function number(v: unknown) { return Number(v ?? 0); }
function points(v: number) { return v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function query(stage: string, user: string, order: string) {
  return "/analytics/teams?" + new URLSearchParams({ stage, user, order }).toString();
}
function outcome(h: number, a: number) { return Math.sign(h - a); }

export default async function TeamFortunesPage({ searchParams }: Props) {
  const login = await getVerifiedLegacyLogin();
  if (!login) redirect("/");
  const sb = client();
  const sp = (await searchParams) ?? {};
  const stages = await readPages<{ id: number; name: string; is_current: boolean; status: string }>(
    (from, to) => sb.from("stages").select("id,name,is_current,status").order("id", { ascending: false }).range(from, to)
  );
  const current = stages.find((s) => s.is_current) ?? stages[0];
  const requested = sp.stage ?? "current";
  const stage = requested === "all" ? "all" : requested === "current" ? String(current?.id ?? "") : requested;
  const selectedStage = stages.find((s) => String(s.id) === stage);
  if (stage !== "all" && !selectedStage) redirect("/analytics/teams");
  const accounts = await readPages<{ user_id: string; login: string }>(
    (from, to) => sb.from("login_accounts").select("user_id,login").neq("login", "ADMIN").order("login").range(from, to)
  );
  const users = accounts.filter((a) => a.user_id && a.login.toUpperCase() !== "ADMIN");
  const selectedUser = users.find((a) => a.user_id === sp.user);
  const userKey = selectedUser?.user_id ?? "all";
  const order = sp.order === "worst" ? "worst" : "best";
  const teams = await readPages<{ id: number; name: string }>(
    (from, to) => sb.from("teams").select("id,name").order("name").range(from, to)
  );
  const teamNames = new Map(teams.map((t) => [number(t.id), t.name]));
  const matches = await readPages<Match>((from, to) => {
    let q = sb.from("matches")
      .select("id,stage_id,home_team_id,away_team_id,home_score,away_score,status,kickoff_at")
      .eq("status", "finished").not("home_score", "is", null).not("away_score", "is", null)
      .order("id").range(from, to);
    if (stage !== "all") q = q.eq("stage_id", number(stage));
    return q;
  });
  const predictions: Prediction[] = [];
  const ledgers: Ledger[] = [];
  for (let i = 0; i < matches.length; i += 100) {
    const ids = matches.slice(i, i + 100).map((m) => m.id);
    predictions.push(...await readPages<Prediction>((from, to) =>
      sb.from("predictions").select("match_id,user_id,home_pred,away_pred").in("match_id", ids).range(from, to)
    ));
    ledgers.push(...await readPages<Ledger>((from, to) =>
      sb.from("points_ledger").select("match_id,user_id,points").in("match_id", ids).range(from, to)
    ));
  }
  const loginById = new Map(users.map((u) => [u.user_id, u.login]));
  const predicted = new Map(predictions.map((p) => [p.match_id + ":" + p.user_id, p]));
  const ledger = new Map(ledgers.map((l) => [l.match_id + ":" + l.user_id, number(l.points)]));
  const stats = new Map<number, TeamStat>();
  function getStat(id: number) {
    let row = stats.get(id);
    if (!row) {
      row = { name: teamNames.get(id) ?? "Команда #" + id, matches: new Set(), points: 0, count: 0, outcomes: 0, exact: 0, samples: [] };
      stats.set(id, row);
    }
    return row;
  }
  for (const m of matches) {
    const home = getStat(number(m.home_team_id));
    const away = getStat(number(m.away_team_id));
    for (const row of [home, away]) row.matches.add(m.id);
    for (const u of users) {
      if (userKey !== "all" && u.user_id !== userKey) continue;
      const key = m.id + ":" + u.user_id;
      const p = predicted.get(key);
      const score = ledger.get(key);
      if (!p || score === undefined || p.home_pred == null || p.away_pred == null) continue;
      const isExact = number(p.home_pred) === number(m.home_score) && number(p.away_pred) === number(m.away_score);
      const isOutcome = outcome(number(p.home_pred), number(p.away_pred)) === outcome(number(m.home_score), number(m.away_score));
      const sample: Sample = {
        id: m.id, match: home.name + " — " + away.name, result: m.home_score + ":" + m.away_score,
        prediction: u.login + " " + p.home_pred + ":" + p.away_pred, points: score, exact: isExact, outcome: isOutcome,
      };
      for (const row of [home, away]) {
        row.count += 1;
        row.points += score;
        row.exact += Number(isExact);
        row.outcomes += Number(isOutcome);
        row.samples.push(sample);
      }
    }
  }
  const sorted = [...stats.values()].filter((x) => x.count > 0).sort((a, b) => {
    const diff = a.points / a.count - b.points / b.count;
    return (order === "best" ? -diff : diff) || a.name.localeCompare(b.name, "ru");
  });
  const scoped = stage === "all" ? "Вся история клуба" : (selectedStage?.name ?? "");
  return (
    <div className="page" style={{ maxWidth: 1120, margin: "0 auto" }}>
      <h1>Удачные и неудачные команды</h1>
      <p className="pageMeta">Какие футбольные команды приносят прогнозистам больше очков, а какие чаще всего оказываются неожиданными.</p>
      <p style={{ opacity: 0.8 }}>Учитываем только завершённые матчи, по которым сохранены прогноз и начисленные очки. Каждый матч относится к обеим игравшим командам. Это не рейтинг силы футбольных клубов.</p>
      <form method="GET" action="/analytics/teams" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", margin: "20px 0" }}>
        <label>Период
          <select name="stage" defaultValue={requested === "current" ? "current" : stage} style={{ display: "block", padding: 10, maxWidth: "100%" }}>
            <option value="current">Текущий этап</option>
            {stages.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            <option value="all">Вся история</option>
          </select>
        </label>
        <label>Участник
          <select name="user" defaultValue={userKey} style={{ display: "block", padding: 10 }}>
            <option value="all">Все участники</option>
            {users.map((u) => <option value={u.user_id} key={u.user_id}>{u.login}</option>)}
          </select>
        </label>
        <label>Порядок
          <select name="order" defaultValue={order} style={{ display: "block", padding: 10 }}>
            <option value="best">Удачные сначала</option>
            <option value="worst">Неудачные сначала</option>
          </select>
        </label>
        <button className="appNavLink" type="submit" style={{ padding: 10, cursor: "pointer" }}>Показать</button>
      </form>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <b>{scoped}</b> · {selectedUser?.login ?? "Все участники"} · {matches.length} завершённых матчей
        <p style={{ marginBottom: 0, opacity: 0.8 }}>Средние очки = сумма начислений за матчи команды ÷ количество учтённых прогнозов. Угаданные исходы и точные счета считаются по фактическим результатам.</p>
      </div>
      {sorted.length === 0 ? <p>Для выбранного периода пока нет завершённых матчей с начисленными прогнозами.</p> : (
        <div style={{ display: "grid", gap: 10 }}>
          {sorted.map((t, index) => (
            <details className="card" key={t.name} style={{ padding: 14 }}>
              <summary style={{ cursor: "pointer", listStyle: "auto" }}>
                <span style={{ fontWeight: 900 }}>{index + 1}. {t.name}</span>
                <span style={{ marginLeft: 12, fontWeight: 800 }}>{points(t.points / t.count)} очка/прогноз</span>
                <span style={{ display: "block", marginTop: 6, opacity: 0.8, fontSize: 13 }}>
                  {t.matches.size} матчей · {t.count} прогнозов · исходов {t.outcomes} ({Math.round(t.outcomes / t.count * 100)}%) · точных счетов {t.exact}
                </span>
              </summary>
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", minWidth: 520 }}>
                  <thead><tr><th>Матч</th><th>Результат</th><th>Прогноз</th><th>Очки</th></tr></thead>
                  <tbody>{t.samples.sort((a,b) => a.id - b.id || a.prediction.localeCompare(b.prediction,"ru")).map((s,i) => (
                    <tr key={s.id + ":" + s.prediction + ":" + i}><td>{s.match}</td><td>{s.result}</td><td>{s.prediction}{s.exact ? " 🎯" : s.outcome ? " ✓" : ""}</td><td>{points(s.points)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
      <div style={{ marginTop: 20 }}><Link href="/analytics">← Назад к аналитике</Link></div>
    </div>
  );
}
