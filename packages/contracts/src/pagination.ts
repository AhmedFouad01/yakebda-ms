import { z } from "zod";

export interface PaginationResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export function paginationResponseSchema<TSchema extends z.ZodTypeAny>(itemSchema: TSchema) {
  return z
    .object({
      data: z.array(itemSchema),
      next_cursor: z.string().min(1).nullable(),
      has_more: z.boolean(),
    })
    .strict();
}
