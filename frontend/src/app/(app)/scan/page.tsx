"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Scanner } from "@/components/Scanner";
import { api } from "@/lib/api";
import { beep, primeAudio } from "@/lib/feedback";
import { money } from "@/lib/format";
import type { ScanResponse } from "@/types";

type Mode = "sell" | "return";

interface LogEntry {
  id: number;
  time: string;
  mode: Mode;
  ok: boolean;
  title: string;
  detail: string;
  amount: number;
}

interface Flash {
  ok: boolean;
  title: string;
  detail: string;
}

// The camera sees the same barcode dozens of times per second. After a scan the
// same code is ignored for this long, so one item held in view counts once.
const COOLDOWN_MS = 1500;
const ALLOW_MANUAL = process.env.NEXT_PUBLIC_ALLOW_MANUAL_ENTRY !== "false";

export default function ScanPage() {
  const [mode, setMode] = useState<Mode>("sell");
  const modeRef = useRef<Mode>("sell");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [manual, setManual] = useState("");

  const busy = useRef(false);
  const last = useRef<{ code: string; until: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logId = useRef(0);

  function chooseMode(m: Mode) {
    modeRef.current = m; // update synchronously so the very next scan uses it
    setMode(m);
  }

  const showFlash = useCallback((f: Flash) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(f);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Keep the phone awake while scanning (not supported everywhere; purely a nicety).
  useEffect(() => {
    if (!cameraOn || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [cameraOn]);

  const handleCode = useCallback(
    async (code: string, source: "camera" | "manual") => {
      if (busy.current) return; // one request at a time
      const now = Date.now();
      if (
        source === "camera" &&
        last.current &&
        last.current.code === code &&
        now < last.current.until
      ) {
        return;
      }

      busy.current = true;
      const action = modeRef.current;
      const entryBase = {
        id: ++logId.current,
        time: new Date().toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        mode: action,
      };
      let cooldown = COOLDOWN_MS;

      try {
        const res = await api.post<ScanResponse>("/scan", { barcode: code, action });
        const p = res.product;
        const verb = action === "sell" ? "Sold" : "Returned";
        beep(true);
        showFlash({
          ok: true,
          title: `${verb}: ${p.name}`,
          detail: `${money(p.price)} · ${p.quantity} left in stock`,
        });
        setLog((prev) =>
          [
            {
              ...entryBase,
              ok: true,
              title: `${verb}: ${p.name}`,
              detail: `${money(p.price)} · ${p.quantity} left`,
              amount: (action === "sell" ? 1 : -1) * Number(p.price),
            },
            ...prev,
          ].slice(0, 50),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Scan failed.";
        beep(false);
        showFlash({ ok: false, title: message, detail: code });
        setLog((prev) =>
          [{ ...entryBase, ok: false, title: message, detail: code, amount: 0 }, ...prev].slice(0, 50),
        );
        cooldown = COOLDOWN_MS * 2; // don't spam errors while the item stays in view
      } finally {
        busy.current = false;
        last.current = { code, until: Date.now() + cooldown };
      }
    },
    [showFlash],
  );

  const onCameraDetect = useCallback((code: string) => void handleCode(code, "camera"), [handleCode]);

  const onCameraError = useCallback((message: string) => {
    setCameraError(message);
    setCameraOn(false);
  }, []);

  function startCamera() {
    primeAudio(); // browsers only allow sound after a user gesture
    setCameraError(null);
    setCameraOn(true);
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    setManual("");
    void handleCode(code, "manual");
  }

  const sold = log.filter((l) => l.ok && l.mode === "sell").length;
  const returned = log.filter((l) => l.ok && l.mode === "return").length;
  const net = log.reduce((sum, l) => sum + l.amount, 0);

  return (
    <>
      <div className="page-head">
        <h1>Scan</h1>
      </div>

      <div className="scan-grid">
        <section aria-label="Scanner">
          <div className="mode-switch" role="group" aria-label="Scan mode">
            <button
              className={`mode-btn sell ${mode === "sell" ? "active" : ""}`}
              aria-pressed={mode === "sell"}
              onClick={() => chooseMode("sell")}
            >
              SELL
            </button>
            <button
              className={`mode-btn return ${mode === "return" ? "active" : ""}`}
              aria-pressed={mode === "return"}
              onClick={() => chooseMode("return")}
            >
              RETURN
            </button>
          </div>

          {cameraError && (
            <div className="alert alert-error" role="alert">
              {cameraError}
            </div>
          )}

          <Scanner
            active={cameraOn}
            onDetect={onCameraDetect}
            onError={onCameraError}
            className={mode}
          >
            {cameraOn ? (
              <>
                <div className="reticle" aria-hidden="true" />
                <span className={`mode-banner ${mode}`}>
                  {mode === "sell" ? "SELLING" : "RETURNING"}
                </span>
              </>
            ) : (
              <div className="scanner-idle">
                <p style={{ margin: 0 }}>
                  Camera is off. Choose <b>{mode === "sell" ? "SELL" : "RETURN"}</b>, then start the
                  camera and point it at a barcode.
                </p>
                <button className="btn btn-primary" onClick={startCamera}>
                  Start camera
                </button>
              </div>
            )}
            {flash && (
              <div className={`flash ${flash.ok ? "ok" : "err"}`} role="status" aria-live="polite">
                {flash.title}
                <small>{flash.detail}</small>
              </div>
            )}
          </Scanner>

          {cameraOn && (
            <div className="scanner-tools">
              <button className="btn" onClick={() => setCameraOn(false)}>
                Stop camera
              </button>
            </div>
          )}

          {ALLOW_MANUAL && (
            <form className="scanner-tools" onSubmit={submitManual}>
              <label className="sr-only" htmlFor="manual-barcode">
                Barcode from a hardware scanner
              </label>
              <input
                id="manual-barcode"
                className="input mono"
                placeholder="Hardware scanner / type barcode + Enter"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
              />
              <button className="btn" disabled={!manual.trim()}>
                {mode === "sell" ? "Sell" : "Return"}
              </button>
            </form>
          )}
        </section>

        <section className="card" aria-label="This session">
          <div className="card-head">
            <h2>This session</h2>
            {log.length > 0 && (
              <button className="btn btn-sm" onClick={() => setLog([])}>
                Clear
              </button>
            )}
          </div>
          <div className="session-totals">
            <div>
              <b>{sold}</b>
              <span>Sold</span>
            </div>
            <div>
              <b>{returned}</b>
              <span>Returned</span>
            </div>
            <div>
              <b>{money(net)}</b>
              <span>Net total</span>
            </div>
          </div>
          {log.length === 0 ? (
            <p className="empty">Scanned items will appear here.</p>
          ) : (
            <ul className="log-list">
              {log.map((l) => (
                <li key={l.id} className={`log-item ${l.ok ? "" : "err"}`}>
                  <div>
                    <div className="title">{l.title}</div>
                    <div className="detail">{l.detail}</div>
                  </div>
                  <span className="detail">{l.time}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
