"use client";

import { useEffect, useState } from "react";
import { Pager } from "@/components/Pager";
import { api } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Paginated, Transaction } from "@/types";

const PAGE_SIZE = 25;

const TYPE_LABEL: Record<Transaction["type"], string> = {
  sale: "Sale",
  return: "Return",
  adjustment: "Adjustment",
};

/** Shared by the admin "Transactions" page (all users) and the user "History"
 *  page (the API itself restricts regular users to their own rows). */
export function TransactionsTable({ showUser }: { showUser: boolean }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tick, setTick] = useState(0);
  const debouncedSearch = useDebounced(search);

  const [data, setData] = useState<Paginated<Transaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<Paginated<Transaction>>("/transactions", {
        page,
        page_size: PAGE_SIZE,
        type,
        search: debouncedSearch,
        date_from: dateFrom,
        date_to: dateTo,
      })
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) =>
        !cancelled && setError(e instanceof Error ? e.message : "Failed to load"),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, type, debouncedSearch, dateFrom, dateTo, tick]);

  // Any filter change returns to the first page.
  const filter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  return (
    <>
      <div className="toolbar">
        <input
          className="input grow"
          placeholder={showUser ? "Search product, barcode or user…" : "Search product or barcode…"}
          value={search}
          onChange={(e) => filter(setSearch)(e.target.value)}
          aria-label="Search transactions"
        />
        <select
          className="input"
          value={type}
          onChange={(e) => filter(setType)(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="sale">Sales</option>
          <option value="return">Returns</option>
          <option value="adjustment">Adjustments</option>
        </select>
        <input
          className="input"
          type="date"
          value={dateFrom}
          onChange={(e) => filter(setDateFrom)(e.target.value)}
          aria-label="From date"
        />
        <input
          className="input"
          type="date"
          value={dateTo}
          onChange={(e) => filter(setDateTo)(e.target.value)}
          aria-label="To date"
        />
        <button className="btn" onClick={() => setTick((t) => t + 1)}>
          Refresh
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Product</th>
              <th className="num">Qty</th>
              <th className="num">Price</th>
              <th className="num">Stock after</th>
              {showUser && <th>User</th>}
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {data?.results.map((t) => (
              <tr key={t.id}>
                <td>{dateTime(t.created_at)}</td>
                <td>
                  <span className={`badge badge-${t.type === "adjustment" ? "x" : t.type}`}>
                    {TYPE_LABEL[t.type]}
                  </span>
                </td>
                <td>
                  {t.product_name} <span className="muted mono">{t.product_barcode}</span>
                </td>
                <td className="num">
                  {t.quantity_change > 0 ? "+" : ""}
                  {t.quantity_change}
                </td>
                <td className="num">{money(t.unit_price)}</td>
                <td className="num">{t.stock_after}</td>
                {showUser && <td>{t.username}</td>}
                <td className="wrap muted">{t.note}</td>
              </tr>
            ))}
            {!loading && data?.results.length === 0 && (
              <tr>
                <td colSpan={showUser ? 8 : 7} className="empty">
                  No transactions found.
                </td>
              </tr>
            )}
            {loading && !data && (
              <tr>
                <td colSpan={showUser ? 8 : 7} className="empty">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && <Pager page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}
    </>
  );
}
