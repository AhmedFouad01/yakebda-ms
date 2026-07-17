import { Knex } from "knex";

const INDEXES = {
  customers: "customers_account_created_id_cursor_idx",
  customerOrders: "orders_account_customer_created_id_cursor_idx",
  products: "products_account_sort_id_cursor_idx",
  productsByCategory: "products_account_category_sort_id_cursor_idx",
} as const;

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("customers", (table) => {
    table.index(["account_id", "created_at", "id"], INDEXES.customers);
  });

  await db.schema.alterTable("orders", (table) => {
    table.index(["account_id", "customer_id", "created_at", "id"], INDEXES.customerOrders);
  });

  await db.schema.alterTable("products", (table) => {
    table.index(["account_id", "sort_order", "id"], INDEXES.products);
    table.index(["account_id", "category_id", "sort_order", "id"], INDEXES.productsByCategory);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("products", (table) => {
    table.dropIndex(["account_id", "category_id", "sort_order", "id"], INDEXES.productsByCategory);
    table.dropIndex(["account_id", "sort_order", "id"], INDEXES.products);
  });

  await db.schema.alterTable("orders", (table) => {
    table.dropIndex(["account_id", "customer_id", "created_at", "id"], INDEXES.customerOrders);
  });

  await db.schema.alterTable("customers", (table) => {
    table.dropIndex(["account_id", "created_at", "id"], INDEXES.customers);
  });
}
