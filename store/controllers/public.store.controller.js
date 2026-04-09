import {
  addCartItem,
  createCheckoutOrder,
  createRazorpayOrder,
  getCart,
  getCustomerOrderByCode,
  getPublicStoreSettings,
  getProductDetail,
  listCategoryTree,
  listCustomerOrders,
  listProducts,
  removeCartItem,
  updateCartItem,
  verifyCheckoutPayment,
} from "../services/store.service.js";
import {
  getCustomerProfile,
  loginCustomer,
  registerCustomer,
  requestCustomerOtp,
  verifyCustomerOtp,
} from "../services/customer-auth.service.js";
import { fail, ok } from "../utils/response.js";

const toErrorStatus = (message = "") => {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return 404;
  if (normalized.includes("unauthorized")) return 401;
  if (normalized.includes("blocked")) return 403;
  if (normalized.includes("validation") || normalized.includes("invalid") || normalized.includes("required")) {
    return 400;
  }
  if (normalized.includes("empty")) return 400;
  return 500;
};

export const getCategoriesTree = async (req, res) => {
  const data = await listCategoryTree({ storeId: req.tenant.storeId });
  return ok(res, data);
};

export const getStoreSettings = async (req, res) => {
  try {
    const data = await getPublicStoreSettings({ storeId: req.tenant.storeId });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to fetch store settings", toErrorStatus(error.message));
  }
};

export const getProducts = async (req, res) => {
  const { page, limit, q, category, sort } = req.query;
  const data = await listProducts({
    storeId: req.tenant.storeId,
    page,
    limit,
    q,
    category,
    sort,
  });
  return ok(res, data);
};

export const getProduct = async (req, res) => {
  const product = await getProductDetail({
    storeId: req.tenant.storeId,
    slugOrId: req.params.slugOrId,
  });

  if (!product) return fail(res, "Product not found", 404);
  return ok(res, product);
};

export const register = async (req, res) => {
  try {
    const data = await registerCustomer({
      storeId: req.tenant.storeId,
      ...req.body,
    });
    return ok(res, data, 201);
  } catch (error) {
    return fail(res, error.message || "Registration failed", toErrorStatus(error.message));
  }
};

export const login = async (req, res) => {
  try {
    const data = await loginCustomer({ storeId: req.tenant.storeId, ...req.body });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Login failed", toErrorStatus(error.message));
  }
};

export const requestOtp = async (req, res) => {
  try {
    const data = await requestCustomerOtp({
      storeId: req.tenant.storeId,
      ...req.body,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "OTP request failed", toErrorStatus(error.message));
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const data = await verifyCustomerOtp({
      storeId: req.tenant.storeId,
      ...req.body,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "OTP verification failed", toErrorStatus(error.message));
  }
};

export const me = async (req, res) => {
  try {
    const data = await getCustomerProfile({
      storeId: req.tenant.storeId,
      customerId: req.customer._id,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to fetch profile", toErrorStatus(error.message));
  }
};

export const readCart = async (req, res) => {
  try {
    const data = await getCart({
      storeId: req.tenant.storeId,
      customer: req.customer,
      guestToken: req.query.guestToken,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to fetch cart", toErrorStatus(error.message));
  }
};

export const addItemToCart = async (req, res) => {
  try {
    const data = await addCartItem({
      storeId: req.tenant.storeId,
      customer: req.customer,
      guestToken: req.body.guestToken,
      productId: req.body.productId,
      variantSku: req.body.variantSku,
      qty: req.body.qty,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to add cart item", toErrorStatus(error.message));
  }
};

export const patchCartItem = async (req, res) => {
  try {
    const data = await updateCartItem({
      storeId: req.tenant.storeId,
      customer: req.customer,
      guestToken: req.body.guestToken,
      lineId: req.params.lineId,
      qty: req.body.qty,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to update cart item", toErrorStatus(error.message));
  }
};

export const deleteCartItem = async (req, res) => {
  try {
    const data = await removeCartItem({
      storeId: req.tenant.storeId,
      customer: req.customer,
      guestToken: req.query.guestToken,
      lineId: req.params.lineId,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to remove cart item", toErrorStatus(error.message));
  }
};

export const createOrder = async (req, res) => {
  try {
    const data = await createCheckoutOrder({
      storeId: req.tenant.storeId,
      customer: req.customer,
      guestToken: req.body.guestToken,
      shippingAddress: req.body.shippingAddress,
      billingAddress: req.body.billingAddress,
      provider: req.body.provider,
      shipping: req.body.shipping,
      tax: req.body.tax,
      customerEmail: req.body.customerEmail,
      customerPhone: req.body.customerPhone,
    });
    return ok(res, data, 201);
  } catch (error) {
    return fail(res, error.message || "Failed to create order", toErrorStatus(error.message));
  }
};

export const createPaymentOrder = async (req, res) => {
  try {
    const data = await createRazorpayOrder({
      storeId: req.tenant.storeId,
      orderCode: req.body.orderCode,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to create payment order", toErrorStatus(error.message));
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const data = await verifyCheckoutPayment({
      storeId: req.tenant.storeId,
      orderCode: req.body.orderCode,
      paymentOrderId: req.body.paymentOrderId,
      paymentId: req.body.paymentId,
      signature: req.body.signature,
      eventId: req.body.eventId,
      raw: req.body.raw,
    });

    if (data.duplicate) {
      return ok(res, {
        duplicate: true,
        order: data.order,
      });
    }

    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Payment verification failed", toErrorStatus(error.message));
  }
};

export const getOrders = async (req, res) => {
  try {
    const data = await listCustomerOrders({
      storeId: req.tenant.storeId,
      customer: req.customer,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to load orders", toErrorStatus(error.message));
  }
};

export const getOrderByCode = async (req, res) => {
  try {
    const data = await getCustomerOrderByCode({
      storeId: req.tenant.storeId,
      customer: req.customer,
      orderCode: req.params.orderCode,
    });
    if (!data) return fail(res, "Order not found", 404);
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to load order", toErrorStatus(error.message));
  }
};
