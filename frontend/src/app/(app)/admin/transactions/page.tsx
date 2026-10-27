"use client";

import { TransactionsTable } from "@/components/TransactionsTable";

export default function AdminTransactionsPage() {
  return (
    <>
      <div className="page-head">
        <h1>Transactions</h1>
      </div>
      <TransactionsTable showUser />
    </>
  );
}
