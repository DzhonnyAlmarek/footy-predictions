"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StageOption = {
  id: number;
  name: string;
  status: string;
};

function stageStatusRu(s: string) {
  if (s === "draft") return "Черновик";
  if (s === "published") return "Опубликован";
  if (s === "locked") return "Закрыт";
  return s;
}

export default function TourRowActions(props: {
  tourId: number;
  stageId: number;
  stageStatus: string; // draft | published | locked
  initialNo: number;
  initialName: string | null;
  stages: StageOption[];
}) {
  const router = useRouter();
  const locked = props.stageStatus === "locked";

  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);

  const [tourNo, setTourNo] = useState(String(props.initialNo));
  const [name, setName] = useState(props.initialName ?? "");

  const [targetStageId, setTargetStageId] = useState("");
  const [renumber, setRenumber] = useState(true);

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const availableStages = props.stages.filter((s) => s.id !== props.stageId);

  async function save() {
    setMsg(null);
    if (locked) return setMsg("Этап закрыт — редактирование тура запрещено");

    const no = Number(tourNo);
    if (!Number.isInteger(no) || no < 1) {
      return setMsg("Номер тура должен быть целым >= 1");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/tours/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tourId: props.tourId,
          tour_no: no,
          name: name,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        const m = j?.message ? ` — ${j.message}` : "";
        throw new Error(`${j?.error ?? `Ошибка (${res.status})`}${m}`);
      }

      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    setMsg(null);
    if (locked) return setMsg("Этап закрыт — удаление тура запрещено");

    if (!confirm("Удалить тур? (Если в туре есть матчи — они тоже будут удалены)")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/tours/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tourId: props.tourId,
          cascadeMatches: true,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        const m = j?.message ? ` — ${j.message}` : "";
        throw new Error(`${j?.error ?? `Ошибка (${res.status})`}${m}`);
      }

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  async function moveTour() {
    setMsg(null);

    const stageId = Number(targetStageId);
    if (!Number.isFinite(stageId)) {
      return setMsg("Выберите этап, куда переносить тур");
    }

    const ok = confirm(
      "Перенести тур в другой этап?\n\n" +
        "Будут перенесены все матчи тура, включая завершённые,\n" +
        "результаты и уже начисленные баллы.\n\n" +
        "Продолжить?"
    );

    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tours/${props.tourId}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_stage_id: stageId,
          renumber,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        throw new Error(j?.error ?? `Ошибка переноса (${res.status})`);
      }

      setMoving(false);
      setTargetStageId("");
      setRenumber(true);
      setMsg("Тур успешно перенесён ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка переноса тура");
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={tourNo}
            onChange={(e) => setTourNo(e.target.value)}
            disabled={loading || locked}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 120 }}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading || locked}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={save}
            disabled={loading || locked}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              opacity: locked ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "..." : "Сохранить"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setTourNo(String(props.initialNo));
              setName(props.initialName ?? "");
              setMsg(null);
            }}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Отмена
          </button>
        </div>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </div>
    );
  }

  if (moving) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Перенос тура в другой этап</div>

        <select
          value={targetStageId}
          onChange={(e) => setTargetStageId(e.target.value)}
          disabled={loading}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            minWidth: 280,
          }}
        >
          <option value="">Выберите этап…</option>
          {availableStages.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.id} — {s.name} ({stageStatusRu(s.status)})
            </option>
          ))}
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={renumber}
            onChange={(e) => setRenumber(e.target.checked)}
            disabled={loading}
          />
          <span>Перенумеровать матчи в новом этапе</span>
        </label>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Будут перенесены все матчи тура, включая завершённые, результаты и уже начисленные баллы.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={moveTour}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "..." : "Подтвердить перенос"}
          </button>

          <button
            onClick={() => {
              setMoving(false);
              setTargetStageId("");
              setRenumber(true);
              setMsg(null);
            }}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Отмена
          </button>
        </div>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button
        onClick={() => setEditing(true)}
        disabled={locked}
        title={locked ? "Этап закрыт — редактирование запрещено" : "Редактировать тур"}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #111",
          background: "#fff",
          opacity: locked ? 0.6 : 1,
        }}
      >
        Редактировать
      </button>

      <button
        onClick={() => {
          setMoving(true);
          setMsg(null);
        }}
        disabled={loading}
        title="Перенести тур в другой этап"
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #111",
          background: "#fff",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        Перенести
      </button>

      <button
        onClick={remove}
        disabled={locked || loading}
        title={locked ? "Этап закрыт — удаление запрещено" : "Удалить тур"}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #111",
          background: "#fff",
          opacity: locked ? 0.6 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "..." : "Удалить"}
      </button>

      {msg && <div style={{ color: "crimson", width: "100%" }}>{msg}</div>}
    </div>
  );
}