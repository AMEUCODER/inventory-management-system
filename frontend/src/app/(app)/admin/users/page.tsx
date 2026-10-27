"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { Pager } from "@/components/Pager";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Paginated, Role, User } from "@/types";

const PAGE_SIZE = 25;

type Editing = User | "new" | null;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const debouncedSearch = useDebounced(search);

  const [data, setData] = useState<Paginated<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Paginated<User>>("/users", { page, page_size: PAGE_SIZE, search: debouncedSearch })
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
  }, [page, debouncedSearch, tick]);

  async function remove(u: User) {
    if (!window.confirm(`Delete user "${u.username}"?`)) return;
    try {
      await api.del(`/users/${u.id}`);
      setError(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Add user
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search username, name or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search users"
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.results.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.username}
                  {u.id === me?.id && <span className="muted"> (you)</span>}
                </td>
                <td>{`${u.first_name} ${u.last_name}`.trim() || <span className="muted">—</span>}</td>
                <td>
                  <span className="badge">{u.role === "admin" ? "Admin" : "User"}</span>
                </td>
                <td>
                  {u.is_active ? (
                    <span className="badge badge-ok">Active</span>
                  ) : (
                    <span className="badge badge-off">Deactivated</span>
                  )}
                </td>
                <td className="muted">{u.last_login ? dateTime(u.last_login) : "Never"}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-sm" onClick={() => setEditing(u)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={u.id === me?.id}
                      onClick={() => remove(u)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && data?.results.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No users found.
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
        <UserForm
          user={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function UserForm({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const creating = user === null;
  const [username, setUsername] = useState(user?.username ?? "");
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "user");
  const [active, setActive] = useState(user?.is_active ?? true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload: Record<string, unknown> = {
      username: username.trim(),
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      is_active: active,
    };
    if (password) payload.password = password;
    try {
      if (creating) await api.post("/users", payload);
      else await api.patch(`/users/${user.id}`, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <Modal title={creating ? "Add user" : `Edit ${user.username}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="u-username">Username</label>
          <input
            id="u-username"
            className="input"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="u-first">First name</label>
            <input
              id="u-first"
              className="input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="u-last">Last name</label>
            <input
              id="u-last"
              className="input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="u-email">Email (optional)</label>
          <input
            id="u-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="u-password">{creating ? "Password" : "New password"}</label>
          <input
            id="u-password"
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={creating}
          />
          <span className="hint">
            {creating ? "At least 8 characters." : "Leave blank to keep the current password."}
          </span>
        </div>
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select
            id="u-role"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={isSelf}
          >
            <option value="user">User (scan only: sell / return)</option>
            <option value="admin">Admin (full control)</option>
          </select>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={active}
            disabled={isSelf}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active (deactivated users can&apos;t sign in)
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
