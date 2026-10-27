"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { useAuth } from "@/lib/auth";

interface NavLink {
  href: string;
  label: string;
  exact?: boolean;
}

const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/scan", label: "Scan" },
];

const USER_LINKS: NavLink[] = [
  { href: "/scan", label: "Scan" },
  { href: "/history", label: "My history" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [pwOpen, setPwOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const blocked = !!user && !isAdmin && pathname.startsWith("/admin");

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (blocked) router.replace("/scan");
  }, [loading, user, blocked, router]);

  if (loading || !user || blocked) {
    return <div className="center-screen muted">Loading…</div>;
  }

  const links = isAdmin ? ADMIN_LINKS : USER_LINKS;

  return (
    <>
      <header className="topbar">
        <span className="brand">Inventory</span>
        <nav className="nav" aria-label="Main">
          {links.map((l) => {
            const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="topbar-right">
          <span className="muted hide-sm">
            {user.username} · {user.role}
          </span>
          <button className="btn btn-sm" onClick={() => setPwOpen(true)}>
            Password
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </>
  );
}
