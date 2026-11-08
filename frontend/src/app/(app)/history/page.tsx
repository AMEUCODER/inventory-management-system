"use client";

import { TransactionsTable } from "@/components/TransactionsTable";

export default function HistoryPage() {
  return (
    <>
      <div className="page-head">
        <h1>My history</h1>
      </div>
      <TransactionsTable showUser={false} />
    </>
  );
}
