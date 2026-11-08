"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef, useState } from "react";

/** Renders a scannable Code 128 barcode. Handy for labelling products that
 *  don't have a printed barcode, and for testing the scanner on screen. */
export function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: 2,
        height: 80,
        displayValue: true,
        margin: 8,
        background: "#ffffff",
        lineColor: "#000000",
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [value]);

  if (failed) {
    return <p className="alert alert-error">This barcode value can&apos;t be drawn.</p>;
  }
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />;
}
