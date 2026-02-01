"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function PointsPopover({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const safeTip = useMemo(() => (tip ?? "").trim(), [tip]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!safeTip) return null;

  return (
    <>
      <button
        type="button"
        className="pointsInfoBtn"
        aria-label="Расшифровка начисления"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        ⓘ
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="pointsModalOverlay"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                // клик по фону закрывает, по карточке — нет
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="pointsModalCard" role="document">
                <div className="pointsModalHeader">
                  <div className="pointsModalTitle">Расшифровка начисления</div>
                  <button
                    type="button"
                    className="pointsModalClose"
                    aria-label="Закрыть"
                    onClick={() => setOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                <pre className="pointsModalBody">{safeTip}</pre>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
