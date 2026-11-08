const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USD";

export function money(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: CURRENCY,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function shortDay(isoDate: string): string {
  // isoDate is YYYY-MM-DD; build a local date so it doesn't shift across timezones.
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
  });
}
