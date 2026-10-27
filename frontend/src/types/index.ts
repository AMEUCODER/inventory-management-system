export type Role = "admin" | "user";

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  date_joined?: string;
  last_login?: string | null;
}

export interface Product {
  id: number;
  name: string;
  barcode: string;
  description: string;
  price: string;
  quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export type TxType = "sale" | "return" | "adjustment";

export interface Transaction {
  id: number;
  product: number;
  product_name: string;
  product_barcode: string;
  user: number;
  username: string;
  type: TxType;
  quantity_change: number;
  unit_price: string;
  stock_after: number;
  note: string;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ScanResponse {
  transaction: Transaction;
  product: {
    id: number;
    name: string;
    barcode: string;
    price: string;
    quantity: number;
  };
}

export interface Stats {
  totals: {
    products: number;
    active_products: number;
    units: number;
    inventory_value: string;
    low_stock: number;
    out_of_stock: number;
  };
  today: { sales: number; returns: number; revenue: string };
  daily: { date: string; sales: number; returns: number; revenue: string }[];
  low_stock: {
    id: number;
    name: string;
    barcode: string;
    quantity: number;
    low_stock_threshold: number;
  }[];
  top_products: { product_id: number; name: string; units_sold: number }[];
}
