import type { NextRequest } from "next/server";

// Runtime proxy: /api/* on this origin -> Django.
// Unlike next.config rewrites (frozen at build time), BACKEND_URL is read on every
// request, so Docker/compose can set it when the container starts, e.g.
// BACKEND_URL=http://backend:8000
export const dynamic = "force-dynamic";

const SKIP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const url = `${backend}/api/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
    const out = new Headers();
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      // fetch() already decoded the body, so drop the encoding/length headers.
      if (!SKIP_HEADERS.has(k) && k !== "content-encoding") out.set(key, value);
    });
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json(
      { detail: `Can't reach the backend API at ${backend}. Check that it is running and BACKEND_URL is correct.` },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
