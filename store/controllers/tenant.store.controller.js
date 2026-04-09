import {
  createCategory,
  createTenantProduct,
  deleteTenantProduct,
  deleteCategory,
  getTenantOrderById,
  listCategoryTree,
  listProducts,
  listTenantCustomers,
  listTenantOrders,
  updateCategory,
  updateTenantCustomerStatus,
  updateTenantOrderFulfillment,
  updateTenantOrderStatus,
  updateTenantProduct,
} from "../services/store.service.js";
import { fail, ok } from "../utils/response.js";

const toErrorStatus = (message = "") => {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return 404;
  if (normalized.includes("invalid") || normalized.includes("required")) return 400;
  return 500;
};

export const getCategoriesTree = async (req, res) => {
  const data = await listCategoryTree({ storeId: req.tenant.storeId });
  return ok(res, data);
};

export const postCategory = async (req, res) => {
  try {
    const data = await createCategory({
      storeId: req.tenant.storeId,
      payload: req.body,
    });
    return ok(res, data, 201);
  } catch (error) {
    return fail(res, error.message || "Failed to create category", toErrorStatus(error.message));
  }
};

export const patchCategory = async (req, res) => {
  try {
    const data = await updateCategory({
      storeId: req.tenant.storeId,
      categoryId: req.params.categoryId,
      payload: req.body,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to update category", toErrorStatus(error.message));
  }
};

export const removeCategory = async (req, res) => {
  try {
    const deleted = await deleteCategory({
      storeId: req.tenant.storeId,
      categoryId: req.params.categoryId,
    });
    if (!deleted) return fail(res, "Category not found", 404);
    return ok(res, { deleted: true });
  } catch (error) {
    return fail(res, error.message || "Failed to delete category", toErrorStatus(error.message));
  }
};

export const getProducts = async (req, res) => {
  const data = await listProducts({
    storeId: req.tenant.storeId,
    page: req.query.page,
    limit: req.query.limit,
    q: req.query.q,
    category: req.query.category,
    status: req.query.status,
    sort: req.query.sort,
    includeUnpublished: true,
  });
  return ok(res, data);
};

export const postProduct = async (req, res) => {
  try {
    const data = await createTenantProduct({
      storeId: req.tenant.storeId,
      payload: req.body,
    });
    return ok(res, data, 201);
  } catch (error) {
    return fail(res, error.message || "Failed to create product", toErrorStatus(error.message));
  }
};

export const patchProduct = async (req, res) => {
  try {
    const data = await updateTenantProduct({
      storeId: req.tenant.storeId,
      productId: req.params.productId,
      payload: req.body,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to update product", toErrorStatus(error.message));
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const deleted = await deleteTenantProduct({
      storeId: req.tenant.storeId,
      productId: req.params.productId,
    });
    if (!deleted) return fail(res, "Product not found", 404);
    return ok(res, { deleted: true });
  } catch (error) {
    return fail(res, error.message || "Failed to delete product", toErrorStatus(error.message));
  }
};

export const getOrders = async (req, res) => {
  const data = await listTenantOrders({
    storeId: req.tenant.storeId,
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    paymentStatus: req.query.paymentStatus,
  });
  return ok(res, data);
};

export const getOrderById = async (req, res) => {
  const data = await getTenantOrderById({
    storeId: req.tenant.storeId,
    orderId: req.params.orderId,
  });
  if (!data) return fail(res, "Order not found", 404);
  return ok(res, data);
};

export const patchOrderStatus = async (req, res) => {
  try {
    const data = await updateTenantOrderStatus({
      storeId: req.tenant.storeId,
      orderId: req.params.orderId,
      status: req.body.status,
      note: req.body.note,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to update order status", toErrorStatus(error.message));
  }
};

export const patchOrderFulfillment = async (req, res) => {
  try {
    const data = await updateTenantOrderFulfillment({
      storeId: req.tenant.storeId,
      orderId: req.params.orderId,
      payload: req.body,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to update fulfillment", toErrorStatus(error.message));
  }
};

export const getCustomers = async (req, res) => {
  const data = await listTenantCustomers({
    storeId: req.tenant.storeId,
    page: req.query.page,
    limit: req.query.limit,
    q: req.query.q,
    status: req.query.status,
  });
  return ok(res, data);
};

export const patchCustomerStatus = async (req, res) => {
  try {
    const data = await updateTenantCustomerStatus({
      storeId: req.tenant.storeId,
      customerId: req.params.customerId,
      status: req.body.status,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message || "Failed to update customer", toErrorStatus(error.message));
  }
};
