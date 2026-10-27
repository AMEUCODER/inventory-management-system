export function Pager({
  page,
  pageSize,
  count,
  onPage,
}: {
  page: number;
  pageSize: number;
  count: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) {
    return (
      <div className="pager">
        <span>{count} {count === 1 ? "result" : "results"}</span>
      </div>
    );
  }
  return (
    <div className="pager">
      <span>
        Page {page} of {pages} · {count} results
      </span>
      <div className="btns">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
