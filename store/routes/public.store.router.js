import { Router } from "express";
import {
  addItemToCart,
  createOrder,
  createPaymentOrder,
  deleteCartItem,
  getCategoriesTree,
  getStoreSettings,
  getOrderByCode,
  getOrders,
  getProduct,
  getProducts,
  login,
  me,
  patchCartItem,
  readCart,
  register,
  requestOtp,
  verifyOtp,
  verifyPayment,
} from "../controllers/public.store.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  optionalCustomerAuth,
  requireCustomerAuth,
} from "../middleware/customer-auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { resolveTenantContext } from "../middleware/tenant-context.js";
import { validateRequest } from "../middleware/validate-request.js";
import {
  addCartItemSchema,
  createOrderSchema,
  createPaymentOrderSchema,
  getCartQuerySchema,
  listOrdersQuerySchema,
  listProductsQuerySchema,
  loginSchema,
  orderCodeParamsSchema,
  productDetailParamsSchema,
  registerSchema,
  requestOtpSchema,
  updateCartItemParamsSchema,
  updateCartItemSchema,
  verifyOtpSchema,
  verifyPaymentSchema,
} from "../validators/public.validators.js";
import { fail } from "../utils/response.js";

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  prefix: "store-auth",
});

const paymentLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  prefix: "store-payment-verify",
});

const router = Router();

router.use(resolveTenantContext);

router.get(
  "/settings",
  asyncHandler(getStoreSettings)
);

router.get(
  "/categories/tree",
  asyncHandler(getCategoriesTree)
);
router.get(
  "/products",
  validateRequest({ query: listProductsQuerySchema }),
  asyncHandler(getProducts)
);
router.get(
  "/products/:slugOrId",
  validateRequest({ params: productDetailParamsSchema }),
  asyncHandler(getProduct)
);

router.post(
  "/auth/register",
  authLimiter,
  validateRequest({ body: registerSchema }),
  asyncHandler(register)
);
router.post(
  "/auth/login",
  authLimiter,
  validateRequest({ body: loginSchema }),
  asyncHandler(login)
);
router.post(
  "/auth/request-otp",
  authLimiter,
  validateRequest({ body: requestOtpSchema }),
  asyncHandler(requestOtp)
);
router.post(
  "/auth/verify-otp",
  authLimiter,
  validateRequest({ body: verifyOtpSchema }),
  asyncHandler(verifyOtp)
);
router.get("/me", requireCustomerAuth, asyncHandler(me));

router.get(
  "/cart",
  optionalCustomerAuth,
  validateRequest({ query: getCartQuerySchema }),
  asyncHandler(readCart)
);
router.post(
  "/cart/items",
  optionalCustomerAuth,
  validateRequest({ body: addCartItemSchema }),
  asyncHandler(addItemToCart)
);
router.patch(
  "/cart/items/:lineId",
  optionalCustomerAuth,
  validateRequest({ params: updateCartItemParamsSchema, body: updateCartItemSchema }),
  asyncHandler(patchCartItem)
);
router.delete(
  "/cart/items/:lineId",
  optionalCustomerAuth,
  validateRequest({ params: updateCartItemParamsSchema, query: getCartQuerySchema }),
  asyncHandler(deleteCartItem)
);

router.post(
  "/checkout/create-order",
  optionalCustomerAuth,
  validateRequest({ body: createOrderSchema }),
  asyncHandler(createOrder)
);
router.post(
  "/checkout/create-payment-order",
  validateRequest({ body: createPaymentOrderSchema }),
  asyncHandler(createPaymentOrder)
);
router.post(
  "/checkout/verify-payment",
  paymentLimiter,
  validateRequest({ body: verifyPaymentSchema }),
  asyncHandler(verifyPayment)
);

router.get(
  "/orders",
  requireCustomerAuth,
  validateRequest({ query: listOrdersQuerySchema }),
  asyncHandler(getOrders)
);
router.get(
  "/orders/:orderCode",
  requireCustomerAuth,
  validateRequest({ params: orderCodeParamsSchema }),
  asyncHandler(getOrderByCode)
);

router.use((error, _req, res, _next) => {
  console.error("public.store.router error:", error);
  return fail(res, "Internal server error", 500);
});

export default router;
