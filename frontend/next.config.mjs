// The browser talks to /api/* on the Next.js origin; the route handler in
// src/app/api/[...path]/route.ts forwards it to Django (BACKEND_URL, read at runtime).
// Benefits: no CORS setup, one origin (so HTTPS on the frontend is enough for
// phone camera access), and the Django URL stays private.

// Dev only: LAN hostnames/IPs allowed to load the dev server, e.g. when testing the
// camera from a phone: ALLOWED_DEV_ORIGINS=192.168.1.20
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins,
};

export default nextConfig;
