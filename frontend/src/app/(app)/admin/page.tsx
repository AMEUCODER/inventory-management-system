"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money, shortDay } from "@/lib/format";
import type { Stats } from "@/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Stats>("/stats")
      .then((s) => !cancelled && setStats(s))
      .catch((e: unknown) =>
        !cancelled && setError(e instanceof Error ? e.message : "Failed to load"),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!stats) return <p className="muted">Loading…</p>;

  const { totals, today, daily } = stats;
  const peak = Math.max(1, ...daily.map((d) => d.sales + d.returns));

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link className="btn btn-primary" href="/admin/products">
          Manage products
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <div className="label">Sold today</div>
          <div className="value">{today.sales}</div>
        </div>
        <div className="stat">
          <div className="label">Returned today</div>
          <div className="value">{today.returns}</div>
        </div>
        <div className="stat">
          <div className="label">Revenue today</div>
          <div className="value">{money(today.revenue)}</div>
        </div>
        <div className="stat">
          <div className="label">Units in stock</div>
          <div className="value">{totals.units}</div>
        </div>
        <div className="stat">
          <div className="label">Stock value</div>
          <div className="value">{money(totals.inventory_value)}</div>
        </div>
        <div className={`stat ${totals.low_stock > 0 ? "warn" : ""}`}>
          <div className="label">Low stock</div>
          <div className="value">{totals.low_stock}</div>
        </div>
        <div className={`stat ${totals.out_of_stock > 0 ? "bad" : ""}`}>
          <div className="label">Out of stock</div>
          <div className="value">{totals.out_of_stock}</div>
        </div>
      </div>

      <section className="card" aria-label="Last 7 days">
        <div className="card-head">
          <h2>Last 7 days</h2>
        </div>
        <div className="bars">
          {daily.map((d) => (
            <div
              className="bar-col"
              key={d.date}
              title={`${d.date}: ${d.sales} sold, ${d.returns} returned, ${money(d.revenue)}`}
            >
              <span>{d.sales + d.returns > 0 ? d.sales + d.returns : ""}</span>
              <div className="bar-stack">
                <div className="bar-returns" style={{ height: `${(d.returns / peak) * 100}%` }} />
                <div className="bar-sales" style={{ height: `${(d.sales / peak) * 100}%` }} />
              </div>
              <span>{shortDay(d.date)}</span>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <i className="dot" style={{ background: "var(--sell)" }} />
            Sold
          </span>
          <span>
            <i className="dot" style={{ background: "var(--return)" }} />
            Returned
          </span>
        </div>
      </section>

      <div className="grid-2">
        <section className="card" aria-label="Needs restocking">
          <div className="card-head">
            <h2>Needs restocking</h2>
            <Link href="/admin/products">All products</Link>
          </div>
          {stats.low_stock.length === 0 ? (
            <p className="empty">Everything is stocked.</p>
          ) : (
            <table className="table">
              <tbody>
                {stats.low_stock.map((p) => (
                  <tr key={p.id}>
                    <td className="wrap">
                      {p.name}
                      <div className="muted mono">{p.barcode}</div>
                    </td>
                    <td className="num">
                      <span className={`badge ${p.quantity === 0 ? "badge-out" : "badge-low"}`}>
                        {p.quantity === 0 ? "Out" : `${p.quantity} left`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card" aria-label="Top sellers">
          <div className="card-head">
            <h2>Top sellers · 30 days</h2>
          </div>
          {stats.top_products.length === 0 ? (
            <p className="empty">No sales yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {stats.top_products.map((p) => (
                  <tr key={p.product_id}>
                    <td className="wrap">{p.name}</td>
                    <td className="num">{p.units_sold} sold</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
