import { z } from "zod";

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const variantSchema = z.object({
  sku: z.string().trim().min(1),
  color: z.string().trim().optional().default(""),
  size: z.string().trim().optional().default(""),
  attributes: z.record(z.string(), z.string()).optional(),
  stock: z.coerce.number().int().min(0).default(0),
  reservedStock: z.coerce.number().int().min(0).default(0),
  priceOverride: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional().default(true),
});

const specSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().optional().default(""),
  parentId: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateCategoryParamsSchema = z.object({
  categoryId: z.string().trim().min(1),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: "At least one field is required",
  });

export const listProductsTenantQuerySchema = paginationQuery.extend({
  q: z.string().trim().optional().default(""),
  category: z.string().trim().optional().default(""),
  status: z.enum(["draft", "published", "archived"]).optional(),
  sort: z
    .enum(["latest", "price_asc", "price_desc", "name_asc", "name_desc"])
    .optional()
    .default("latest"),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().optional().default(""),
  description: z.string().optional().default(""),
  shortDescription: z.string().optional().default(""),
  categoryId: z.string().trim().min(1),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  mrp: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  currency: z.string().trim().default("INR"),
  media: z
    .object({
      images: z.array(z.string()).optional().default([]),
      videoUrl: z.string().optional().default(""),
    })
    .optional()
    .default({ images: [], videoUrl: "" }),
  variants: z.array(variantSchema).min(1),
  specs: z.array(specSchema).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  seo: z
    .object({
      title: z.string().optional().default(""),
      description: z.string().optional().default(""),
    })
    .optional()
    .default({ title: "", description: "" }),
});

export const updateProductParamsSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

export const updateProductSchema = createProductSchema.partial();

export const listOrdersTenantQuerySchema = paginationQuery.extend({
  status: z
    .enum(["new", "confirmed", "packed", "shipped", "delivered", "cancelled", "rto"])
    .optional(),
  paymentStatus: z
    .enum(["created", "authorized", "captured", "failed", "refunded", "pending"])
    .optional(),
});

export const orderParamsSchema = z.object({
  orderId: z.coerce.number().int().positive(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["new", "confirmed", "packed", "shipped", "delivered", "cancelled", "rto"]),
  note: z.string().optional().default(""),
});

export const updateFulfillmentSchema = z.object({
  trackingId: z.string().optional().default(""),
  trackingUrl: z.string().optional().default(""),
  courier: z.string().optional().default(""),
  shippedAt: z.string().datetime().optional(),
  deliveredAt: z.string().datetime().optional(),
  notes: z.string().optional().default(""),
});

export const listCustomersTenantQuerySchema = paginationQuery.extend({
  q: z.string().trim().optional().default(""),
  status: z.enum(["active", "blocked"]).optional(),
});

export const customerParamsSchema = z.object({
  customerId: z.coerce.number().int().positive(),
});

export const updateCustomerStatusSchema = z.object({
  status: z.enum(["active", "blocked"]),
});
