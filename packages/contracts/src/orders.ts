import { z } from "zod";

export const ORDER_STATUSES = [
  "draft",
  "submitted",
  "in_kitchen",
  "ready",
  "completed",
  "cancelled",
] as const;

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const moneyWireSchema = z.union([z.number(), z.string()]);

export const customerOrderSummarySchema = z
  .object({
    id: z.string().uuid(),
    order_no: z.number().int(),
    order_prefix: z.string().nullable(),
    order_type: z.string().min(1),
    status: orderStatusSchema,
    total: moneyWireSchema,
    created_at: z.string().datetime(),
  })
  .strict();

export const orderListSummarySchema = customerOrderSummarySchema
  .extend({
    branch_id: z.string().uuid(),
  })
  .strict();

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type CustomerOrderSummary = z.infer<typeof customerOrderSummarySchema>;
export type OrderListSummary = z.infer<typeof orderListSummarySchema>;
