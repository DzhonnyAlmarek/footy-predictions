"use client";

import { useEffect, useState } from "react";

type RecordItem = { label: string; value: string; holder: string; details: string };

export default function ClubRecords() {
  const [records, setRecords] = useState<RecordItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled=false;
    fetch("/api/cutover/club-records", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("records HTTP "+response.status);
        return response.json();
      })
      .then(data => {
        if (!data.ok || !Array.isArray(data.records)) throw new Error("invalid records response");
        if (!cancelled) { setRecords(data.records); setFailed(false); }
      })
      .catch(error => {
        if (!cancelled) { console.warn("Club records unavailable:", error instanceof Error ? error.message : "unknown"); setFailed(true); }
      });
    return () => { cancelled=true; };
  }, []);

  return <section style={{marginTop:28}}>
    <h3>Рекорды клуба</h3>
    <p>Исторические достижения за все завершённые этапы и уже сыгранные матчи текущего этапа. Черновики и тестовые матчи не учитываются. Рекорды не дают дополнительных очков или наград.</p>
    {failed?<p>Рекорды временно недоступны.</p>:records===null?<p>Загружаем историю клуба…</p>:
      records.length===0?<p>Пока нет данных для рекордов.</p>:
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Рекорд</th><th>Значение</th><th>Участник</th><th>Когда и где</th></tr></thead>
        <tbody>{records.map(item=><tr key={item.label}>
          <td><strong>{item.label}</strong></td><td>{item.value}</td>
          <td>{item.holder}</td><td>{item.details}</td>
        </tr>)}</tbody>
      </table></div>}
    <small>При равных достижениях в таблице показан один рекордсмен. Результаты текущего незавершённого этапа могут измениться.</small>
  </section>;
}
