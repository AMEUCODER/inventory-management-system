"use client";

import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Restricting formats makes decoding faster and avoids false positives.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

function describeCameraError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError") {
    return "The camera is being used by another app. Close it and try again.";
  }
  return "Couldn't start the camera.";
}

interface Props {
  active: boolean;
  onDetect: (code: string) => void;
  onError: (message: string) => void;
  className?: string;
  children?: ReactNode;
}

export function Scanner({ active, onDetect, onError, className, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Keep the latest callbacks in refs so changing them never restarts the camera.
  const detectRef = useRef(onDetect);
  const errorRef = useRef(onError);
  useEffect(() => {
    detectRef.current = onDetect;
    errorRef.current = onError;
  });

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      errorRef.current(
        "Camera access needs HTTPS (or localhost). Open this site over HTTPS to use the camera.",
      );
      return;
    }

    let cancelled = false;
    let controls: IScannerControls | undefined;

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 80,
      delayBetweenScanSuccess: 300,
    });

    // With no deviceId zxing asks for the rear ("environment") camera.
    reader
      .decodeFromVideoDevice(deviceId || undefined, video, (result) => {
        if (result) detectRef.current(result.getText());
      })
      .then(async (c) => {
        if (cancelled) {
          c.stop();
          return;
        }
        controls = c;
        try {
          const list = await BrowserCodeReader.listVideoInputDevices();
          if (!cancelled) setDevices(list);
        } catch {
          /* device list is optional */
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) errorRef.current(describeCameraError(e));
      });

    return () => {
      cancelled = true;
      controls?.stop();
      video.srcObject = null;
    };
  }, [active, deviceId]);

  return (
    <>
      <div className={`scanner ${className ?? ""}`}>
        <video ref={videoRef} muted playsInline autoPlay />
        {children}
      </div>
      {active && devices.length > 1 && (
        <div className="scanner-tools">
          <label className="sr-only" htmlFor="camera-select">
            Camera
          </label>
          <select
            id="camera-select"
            className="input"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <option value="">Default camera</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
