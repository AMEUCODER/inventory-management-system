"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BarcodeSvg } from "@/components/BarcodeSvg";
import { Modal } from "@/components/Modal";
import { Pager } from "@/components/Pager";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Paginated, Product } from "@/types";

const PAGE_SIZE = 25;

type Editing = Product | "new" | null;

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState("");
  const [tick, setTick] = useState(0);
  const debouncedSearch = useDebounced(search);

  const [data, setData] = useState<Paginated<Product> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Editing>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [barcodeFor, setBarcodeFor] = useState<Product | null>(null);

  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Paginated<Product>>("/products", {
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch,
        stock,
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) =>
        !cancelled && setError(e instanceof Error ? e.message : "Failed to load"),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, stock, tick]);

  async function remove(p: Product) {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    try {
      await api.del(`/products/${p.id}`);
      setError(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function stockBadge(p: Product) {
    if (p.quantity === 0) return <span className="badge badge-out">Out</span>;
    if (p.is_low_stock) return <span className="badge badge-low">Low</span>;
    return null;
  }

  return (
    <>
      <div className="page-head">
        <h1>Products</h1>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Add product
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search name or barcode…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search products"
        />
        <select
          className="input"
          value={stock}
          onChange={(e) => {
            setStock(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by stock"
        >
          <option value="">All stock levels</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Barcode</th>
              <th className="num">Price</th>
              <th className="num">Stock</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.results.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="mono">{p.barcode}</td>
                <td className="num">{money(p.price)}</td>
                <td className="num">
                  {p.quantity} {stockBadge(p)}
                </td>
                <td>
                  {p.is_active ? (
                    <span className="badge badge-ok">Active</span>
                  ) : (
                    <span className="badge badge-off">Inactive</span>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm" onClick={() => setAdjusting(p)}>
                      Adjust stock
                    </button>
                    <button className="btn btn-sm" onClick={() => setBarcodeFor(p)}>
                      Barcode
                    </button>
                    <button className="btn btn-sm" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && data?.results.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No products found.
                </td>
              </tr>
            )}
            {loading && !data && (
              <tr>
                <td colSpan={6} className="empty">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && <Pager page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}

      {editing && (
        <ProductForm
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {adjusting && (
        <AdjustForm
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            reload();
          }}
        />
      )}
      {barcodeFor && (
        <Modal title={barcodeFor.name} onClose={() => setBarcodeFor(null)}>
          <div className="print-area">
            <div className="barcode-box">
              <strong>{barcodeFor.name}</strong>
              <BarcodeSvg value={barcodeFor.barcode} />
            </div>
          </div>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Print this for items without a barcode, or scan it straight off the screen to test.
          </p>
          <div className="modal-foot">
            <button className="btn" onClick={() => setBarcodeFor(null)}>
              Close
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const creating = product === null;
  const [name, setName] = useState(product?.name ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [price, setPrice] = useState(product?.price ?? "");
  const [quantity, setQuantity] = useState("0");
  const [threshold, setThreshold] = useState(String(product?.low_stock_threshold ?? 5));
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      barcode: barcode.trim(),
      price,
      low_stock_threshold: Number(threshold) || 0,
      description,
      is_active: active,
    };
    try {
      if (creating) {
        await api.post("/products", { ...payload, quantity: Number(quantity) || 0 });
      } else {
        await api.patch(`/products/${product.id}`, payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <Modal title={creating ? "Add product" : "Edit product"} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="p-name">Name</label>
          <input
            id="p-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="p-barcode">Barcode</label>
          <input
            id="p-barcode"
            className="input mono"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            required
          />
          <span className="hint">Type the number printed under the barcode, or invent one for your own labels.</span>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="p-price">Price</label>
            <input
              id="p-price"
              className="input"
              type="number"
              min="0"
              step="0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          {creating ? (
            <div className="field">
              <label htmlFor="p-qty">Initial stock</label>
              <input
                id="p-qty"
                className="input"
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <span className="label">Current stock</span>
              <span className="input" style={{ display: "flex", alignItems: "center" }}>
                {product.quantity}
              </span>
              <span className="hint">Use &ldquo;Adjust stock&rdquo; to change it.</span>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="p-threshold">Low-stock warning at</label>
          <input
            id="p-threshold"
            className="input"
            type="number"
            min="0"
            step="1"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p-desc">Description (optional)</label>
          <textarea
            id="p-desc"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active (inactive products can&apos;t be scanned)
        </label>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const change = Number(delta);
  const valid = Number.isInteger(change) && change !== 0;
  const after = product.quantity + (valid ? change : 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(`/products/${product.id}/adjust`, { delta: change, note });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Adjust stock · ${product.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <p style={{ marginTop: 0 }}>
          Current stock: <b>{product.quantity}</b>
          {valid && (
            <>
              {" "}
              → <b>{after}</b>
            </>
          )}
        </p>
        <div className="field">
          <label htmlFor="a-delta">Change</label>
          <input
            id="a-delta"
            className="input"
            type="number"
            step="1"
            placeholder="e.g. 24 to add, -3 to remove"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor="a-note">Reason (optional)</label>
          <input
            id="a-note"
            className="input"
            maxLength={255}
            placeholder="Restock, damaged, recount…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving || !valid || after < 0}>
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
        {after < 0 && <div className="alert alert-error">Stock can&apos;t go below zero.</div>}
      </form>
    </Modal>
  );
}
