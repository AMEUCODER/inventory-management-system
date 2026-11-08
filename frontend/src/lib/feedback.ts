// Audio + haptic feedback for scans. Cashiers aren't always looking at the screen.
let ctx: AudioContext | null = null;

/** Call from a user gesture (e.g. the Start camera click) so browsers allow sound. */
export function primeAudio() {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* sound is optional */
  }
}

export function beep(ok: boolean) {
  try {
    if (ctx) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
    }
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(ok ? 40 : [80, 40, 80]);
  }
}
