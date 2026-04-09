import { Router } from "express";
import {
  deleteProduct,
  getCategoriesTree,
  getCustomers,
  getOrderById,
  getOrders,
  getProducts,
  patchCategory,
  patchCustomerStatus,
  patchOrderFulfillment,
  patchOrderStatus,
  patchProduct,
  postCategory,
  postProduct,
  removeCategory,
} from "../controllers/tenant.store.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireTenantAdminAuth } from "../middleware/tenant-admin-auth.js";
import { resolveTenantContext } from "../middleware/tenant-context.js";
import { validateRequest } from "../middleware/validate-request.js";
import {
  createCategorySchema,
  createProductSchema,
  customerParamsSchema,
  listCustomersTenantQuerySchema,
  listOrdersTenantQuerySchema,
  listProductsTenantQuerySchema,
  orderParamsSchema,
  updateCategoryParamsSchema,
  updateCategorySchema,
  updateCustomerStatusSchema,
  updateFulfillmentSchema,
  updateOrderStatusSchema,
  updateProductParamsSchema,
  updateProductSchema,
} from "../validators/tenant.validators.js";
import { fail } from "../utils/response.js";

const router = Router();

router.use(requireTenantAdminAuth);
router.use(resolveTenantContext);

router.get("/categories/tree", asyncHandler(getCategoriesTree));
router.post(
  "/categories",
  validateRequest({ body: createCategorySchema }),
  asyncHandler(postCategory)
);
router.patch(
  "/categories/:categoryId",
  validateRequest({ params: updateCategoryParamsSchema, body: updateCategorySchema }),
  asyncHandler(patchCategory)
);
router.delete(
  "/categories/:categoryId",
  validateRequest({ params: updateCategoryParamsSchema }),
  asyncHandler(removeCategory)
);

router.get(
  "/products",
  validateRequest({ query: listProductsTenantQuerySchema }),
  asyncHandler(getProducts)
);
router.post(
  "/products",
  validateRequest({ body: createProductSchema }),
  asyncHandler(postProduct)
);
router.patch(
  "/products/:productId",
  validateRequest({ params: updateProductParamsSchema, body: updateProductSchema }),
  asyncHandler(patchProduct)
);
router.delete(
  "/products/:productId",
  validateRequest({ params: updateProductParamsSchema }),
  asyncHandler(deleteProduct)
);

router.get(
  "/orders",
  validateRequest({ query: listOrdersTenantQuerySchema }),
  asyncHandler(getOrders)
);
router.get(
  "/orders/:orderId",
  validateRequest({ params: orderParamsSchema }),
  asyncHandler(getOrderById)
);
router.patch(
  "/orders/:orderId/status",
  validateRequest({ params: orderParamsSchema, body: updateOrderStatusSchema }),
  asyncHandler(patchOrderStatus)
);
router.patch(
  "/orders/:orderId/fulfillment",
  validateRequest({ params: orderParamsSchema, body: updateFulfillmentSchema }),
  asyncHandler(patchOrderFulfillment)
);

router.get(
  "/customers",
  validateRequest({ query: listCustomersTenantQuerySchema }),
  asyncHandler(getCustomers)
);
router.patch(
  "/customers/:customerId/status",
  validateRequest({ params: customerParamsSchema, body: updateCustomerStatusSchema }),
  asyncHandler(patchCustomerStatus)
);

router.use((error, _req, res, _next) => {
  console.error("tenant.store.router error:", error);
  return fail(res, "Internal server error", 500);
});

export default router;
