import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  customerLookupSchema,
  customerOrderSummarySchema,
  orderStatusSchema,
  paginationResponseSchema,
} from "../src";

const ID = "11111111-1111-4111-8111-111111111111";

describe("pagination response contract", () => {
  const schema = paginationResponseSchema(z.object({ id: z.string().uuid() }).strict());

  it("accepts a page with a continuation cursor", () => {
    const result = schema.parse({ data: [{ id: ID }], next_cursor: "opaque-cursor", has_more: true });
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe("opaque-cursor");
  });

  it("accepts a final page", () => {
    const result = schema.parse({ data: [], next_cursor: null, has_more: false });
    expect(result).toEqual({ data: [], next_cursor: null, has_more: false });
  });

  it("rejects invalid pagination metadata", () => {
    expect(schema.safeParse({ data: [], next_cursor: "", has_more: true }).success).toBe(false);
    expect(schema.safeParse({ data: [], next_cursor: null }).success).toBe(false);
  });
});

describe("customer contracts", () => {
  it("accepts nullable customer lookup fields", () => {
    expect(
      customerLookupSchema.safeParse({
        id: ID,
        name: "Customer",
        phone: null,
        alt_phone: null,
        address: null,
        addresses: null,
      }).success
    ).toBe(true);
  });

  it("rejects missing required customer fields", () => {
    expect(customerLookupSchema.safeParse({ id: ID, name: "Customer" }).success).toBe(false);
  });
});

describe("order contracts", () => {
  it.each(["draft", "submitted", "in_kitchen", "ready", "completed", "cancelled"])(
    "accepts the %s status",
    (status) => {
      expect(orderStatusSchema.safeParse(status).success).toBe(true);
    }
  );

  it("rejects unsupported order statuses", () => {
    expect(orderStatusSchema.safeParse("refunded").success).toBe(false);
  });

  it("accepts a historical order with a nullable prefix", () => {
    expect(
      customerOrderSummarySchema.safeParse({
        id: ID,
        order_no: 42,
        order_prefix: null,
        order_type: "takeaway",
        status: "completed",
        total: "125.50",
        created_at: "2026-07-16T00:00:00.000Z",
      }).success
    ).toBe(true);
  });
});
