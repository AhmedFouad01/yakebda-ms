import { z } from "zod";

export const customerAddressSchema = z
  .object({
    label: z.string().nullable().optional(),
    area: z.string().nullable().optional(),
    landmark: z.string().nullable().optional(),
    floor: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

export const customerLookupSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    phone: z.string().nullable(),
    alt_phone: z.string().nullable(),
    address: z.string().nullable(),
    addresses: z.union([z.array(customerAddressSchema), z.string()]).nullable(),
  })
  .strict();

export const customerListSchema = z
  .object({
    id: z.string().uuid(),
    account_id: z.string().uuid(),
    name: z.string().min(1),
    phone: z.string().nullable(),
    alt_phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    addresses: z.union([z.array(customerAddressSchema), z.string()]).nullable(),
    birthday: z.string().nullable(),
    gender: z.string().nullable(),
    preferred_language: z.string().nullable(),
    preferred_order_type: z.string().nullable(),
    preferred_payment_method: z.string().nullable(),
    loyalty_points: z.number().int(),
    loyalty_tier: z.string().nullable(),
    marketing_opt_in: z.boolean(),
    sms_opt_in: z.boolean(),
    whatsapp_opt_in: z.boolean(),
    is_blocked: z.boolean(),
    block_reason: z.string().nullable(),
    is_vip: z.boolean(),
    tags: z.string().nullable(),
    allergy_note: z.string().nullable(),
    delivery_instructions: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export type CustomerAddress = z.infer<typeof customerAddressSchema>;
export type CustomerLookup = z.infer<typeof customerLookupSchema>;
export type CustomerListItem = z.infer<typeof customerListSchema>;
