import mongoose from "mongoose";
import StoreCategory from "../models/category.model.js";
import StoreProduct from "../models/product.model.js";
import StoreCustomer from "../models/customer.model.js";
import StoreCart from "../models/cart.model.js";
import StoreOrder from "../models/order.model.js";
import StorePaymentEvent from "../models/paymentEvent.model.js";
import StoreInventoryLedger from "../models/inventoryLedger.model.js";
import StoreSettings from "../models/storeSettings.model.js";
import { getNextStoreSequence } from "../utils/sequence.js";
import { toSlug } from "../utils/slug.js";
import { isDuplicateKeyError, verifyRazorpaySignature } from "../utils/payment.js";
import { withLegacyOrderAliases, withLegacyProductAliases } from "../utils/legacy.js";
import { computePricing, resolvePaymentEventId } from "./checkout.helpers.js";

const isLikelyObjectId = (value) => mongoose.isValidObjectId(value);

const sortMap = {
  latest: { createdAt: -1 },
  price_asc: { salePrice: 1 },
  price_desc: { salePrice: -1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
};

export const buildCategoryTree = (categories) => {
  const map = new Map();
  const roots = [];

  categories.forEach((doc) => {
    const obj = doc.toObject ? doc.toObject() : doc;
    obj.children = [];
    map.set(String(obj._id), obj);
  });

  map.forEach((cat) => {
    const parentKey = cat.parentId ? String(cat.parentId) : null;
    if (parentKey && map.has(parentKey)) {
      map.get(parentKey).children.push(cat);
    } else {
      roots.push(cat);
    }
  });

  const sortRecursive = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortRecursive(node.children));
  };
  sortRecursive(roots);
  return roots;
};

export const listCategoryTree = async ({ storeId }) => {
  const categories = await StoreCategory.find({ storeId, isActive: true }).sort({ name: 1 }).lean();
  return buildCategoryTree(categories);
};

const normalizeSocialUrl = (value) => {
  const text = String(value || "").trim();
  if (!text || text === "#") return "";
  return text;
};

const toPublicStoreSettings = ({ storeId, settings }) => {
  const storeName = String(settings?.storeName || "").trim();
  const navbarTitle = String(settings?.navbarTitle || "").trim() || storeName;
  const footerTitle = String(settings?.footerTitle || "").trim() || storeName;
  const footerDescription = String(settings?.footerDescription || "").trim();
  const email = String(settings?.companyEmail || settings?.email || "").trim();
  const phone = String(settings?.phone || "").trim();
  const address = String(settings?.companyAddress || settings?.address || "").trim();
  const currencySymbol = String(settings?.currencySymbol || "").trim() || "₹";

  return {
    storeId,
    storeName: storeName || navbarTitle || footerTitle || "Store",
    navbarTitle: navbarTitle || storeName || "Store",
    footerTitle: footerTitle || storeName || "Store",
    footerDescription,
    email,
    phone,
    address,
    currencySymbol,
    social: {
      instagramUrl: normalizeSocialUrl(settings?.instagramUrl),
      facebookUrl: normalizeSocialUrl(settings?.facebookUrl),
      twitterUrl: normalizeSocialUrl(settings?.twitterUrl),
      youtubeUrl: normalizeSocialUrl(settings?.youtubeUrl),
      linkedinUrl: normalizeSocialUrl(settings?.linkedinUrl),
    },
  };
};

export const getPublicStoreSettings = async ({ storeId }) => {
  const settings = await StoreSettings.findOne({ storeId }).lean();
  return toPublicStoreSettings({ storeId, settings });
};

const findCategoryByQuery = async ({ storeId, category }) => {
  if (!category) return null;
  if (isLikelyObjectId(category)) {
    const byId = await StoreCategory.findOne({ storeId, _id: category }).select("_id").lean();
    if (byId) return byId;
  }
  return StoreCategory.findOne({ storeId, slug: category }).select("_id").lean();
};

export const listProducts = async ({
  storeId,
  page,
  limit,
  q,
  category,
  status,
  sort,
  includeUnpublished = false,
}) => {
  const filter = { storeId };
  if (status) {
    filter.status = status;
  } else if (!includeUnpublished) {
    filter.status = "published";
  }

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { tags: { $in: [new RegExp(q, "i")] } },
    ];
  }

  if (category) {
    const cat = await findCategoryByQuery({ storeId, category });
    if (cat) filter.categoryId = cat._id;
    else return { items: [], pagination: { page, limit, total: 0 } };
  }

  const total = await StoreProduct.countDocuments(filter);
  const docs = await StoreProduct.find(filter)
    .sort(sortMap[sort] || sortMap.latest)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const items = docs.map((doc) => withLegacyProductAliases(doc));
  return {
    items,
    pagination: { page, limit, total },
  };
};

export const getProductDetail = async ({ storeId, slugOrId }) => {
  const numeric = Number(slugOrId);
  let product = null;

  if (Number.isFinite(numeric)) {
    product = await StoreProduct.findOne({ storeId, productId: numeric }).lean();
  }

  if (!product && isLikelyObjectId(slugOrId)) {
    product = await StoreProduct.findOne({ storeId, _id: slugOrId }).lean();
  }

  if (!product) {
    product = await StoreProduct.findOne({ storeId, slug: slugOrId }).lean();
  }

  return product ? withLegacyProductAliases(product) : null;
};

const resolveVariant = (product, variantSku = "") => {
  if (!Array.isArray(product.variants) || product.variants.length === 0) return null;
  if (variantSku) {
    return product.variants.find((v) => v.sku === variantSku && v.isActive !== false) || null;
  }
  return product.variants.find((v) => v.isActive !== false) || product.variants[0] || null;
};

const getCartOwner = ({ customer, guestToken }) => {
  if (customer?._id) {
    return { customerId: customer._id, guestToken: "" };
  }
  if (guestToken) {
    return { customerId: null, guestToken };
  }
  return null;
};

const getCartQuery = ({ storeId, owner }) => {
  if (owner.customerId) {
    return { storeId, customerId: owner.customerId };
  }
  return { storeId, guestToken: owner.guestToken };
};

const ensureCart = async ({ storeId, customer, guestToken, session = null }) => {
  const owner = getCartOwner({ customer, guestToken });
  if (!owner) throw new Error("Customer auth or guestToken is required");

  const query = getCartQuery({ storeId, owner });
  let cartQuery = StoreCart.findOne(query);
  if (session) cartQuery = cartQuery.session(session);
  let cart = await cartQuery;

  if (!cart) {
    cart = await StoreCart.create([
      {
        ...query,
        items: [],
        currency: "INR",
      },
    ], session ? { session } : undefined);
    cart = cart[0];
  }

  return cart;
};

const priceCartItemsFromDb = async ({ storeId, items, session = null }) => {
  const productIds = items.map((item) => item.productId);
  let query = StoreProduct.find({ storeId, productId: { $in: productIds } });
  if (session) query = query.session(session);
  const products = await query;
  const productMap = new Map(products.map((p) => [p.productId, p]));

  const pricedItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Product not found: ${item.productId}`);

    const variant = resolveVariant(product, item.variantSku || "");
    if (!variant) throw new Error(`No active variant for product ${item.productId}`);

    const unitPrice = Number(variant.priceOverride ?? product.salePrice ?? product.mrp ?? 0);
    const qty = Number(item.qty);
    const lineTotal = unitPrice * qty;

    pricedItems.push({
      _id: item._id,
      productId: item.productId,
      productRef: product._id,
      variantSku: variant.sku,
      nameSnapshot: product.name,
      imageSnapshot: product.media?.images?.[0] || "",
      qty,
      unitPrice,
      lineTotal,
    });
    subtotal += lineTotal;
  }

  return {
    items: pricedItems,
    subtotal,
    discountTotal: 0,
    total: subtotal,
    currency: "INR",
  };
};

export const getCart = async ({ storeId, customer, guestToken }) => {
  const cart = await ensureCart({ storeId, customer, guestToken });
  const priced = await priceCartItemsFromDb({ storeId, items: cart.items || [] });

  cart.items = priced.items;
  cart.subtotal = priced.subtotal;
  cart.discountTotal = priced.discountTotal;
  cart.total = priced.total;
  cart.currency = priced.currency;
  await cart.save();

  return cart.toObject();
};

export const addCartItem = async ({ storeId, customer, guestToken, productId, variantSku, qty }) => {
  const cart = await ensureCart({ storeId, customer, guestToken });

  const existingIndex = cart.items.findIndex(
    (line) => Number(line.productId) === Number(productId) && String(line.variantSku || "") === String(variantSku || "")
  );

  if (existingIndex >= 0) {
    cart.items[existingIndex].qty += qty;
  } else {
    cart.items.push({
      productId: Number(productId),
      productRef: new mongoose.Types.ObjectId(),
      variantSku: variantSku || "",
      nameSnapshot: "",
      imageSnapshot: "",
      qty,
      unitPrice: 0,
      lineTotal: 0,
    });
  }

  const priced = await priceCartItemsFromDb({ storeId, items: cart.items || [] });
  cart.items = priced.items;
  cart.subtotal = priced.subtotal;
  cart.discountTotal = priced.discountTotal;
  cart.total = priced.total;
  cart.currency = priced.currency;
  await cart.save();

  return cart.toObject();
};

export const updateCartItem = async ({ storeId, customer, guestToken, lineId, qty }) => {
  const cart = await ensureCart({ storeId, customer, guestToken });
  const idx = cart.items.findIndex((line) => String(line._id) === String(lineId));
  if (idx === -1) throw new Error("Cart line not found");

  if (qty <= 0) {
    cart.items.splice(idx, 1);
  } else {
    cart.items[idx].qty = qty;
  }

  const priced = await priceCartItemsFromDb({ storeId, items: cart.items || [] });
  cart.items = priced.items;
  cart.subtotal = priced.subtotal;
  cart.discountTotal = priced.discountTotal;
  cart.total = priced.total;
  cart.currency = priced.currency;
  await cart.save();

  return cart.toObject();
};

export const removeCartItem = async ({ storeId, customer, guestToken, lineId }) => {
  return updateCartItem({ storeId, customer, guestToken, lineId, qty: 0 });
};

const runWithTransaction = async (task) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await task(session);
    });
    return result;
  } catch (error) {
    const message = String(error?.message || "");
    const noTransactionSupport =
      message.includes("Transaction numbers are only allowed") ||
      message.includes("does not support retryable writes");

    if (noTransactionSupport) {
      return task(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const reserveInventory = async ({ storeId, items, orderCode, session, actor }) => {
  for (const item of items) {
    const product = await StoreProduct.findOne({ storeId, productId: item.productId }).session(session);
    if (!product) throw new Error(`Product not found: ${item.productId}`);

    const variant = resolveVariant(product, item.variantSku);
    if (!variant) throw new Error(`Variant not found for product ${item.productId}`);

    const available = Number(variant.stock) - Number(variant.reservedStock || 0);
    if (available < item.qty) {
      throw new Error(`Insufficient stock for ${product.name}`);
    }

    variant.reservedStock = Number(variant.reservedStock || 0) + item.qty;
    await product.save({ session });

    await StoreInventoryLedger.create(
      [
        {
          storeId,
          productId: item.productId,
          variantSku: variant.sku,
          changeType: "order_reserve",
          qtyChange: -Math.abs(item.qty),
          orderCode,
          reason: "checkout reserve",
          actor,
        },
      ],
      session ? { session } : undefined
    );
  }
};

const releaseInventoryReservation = async ({ storeId, items, orderCode, session, actor }) => {
  for (const item of items) {
    const product = await StoreProduct.findOne({ storeId, productId: item.productId }).session(session);
    if (!product) continue;

    const variant = resolveVariant(product, item.variantSku);
    if (!variant) continue;

    const currentReserved = Number(variant.reservedStock || 0);
    variant.reservedStock = Math.max(0, currentReserved - item.qty);
    await product.save({ session });

    await StoreInventoryLedger.create(
      [
        {
          storeId,
          productId: item.productId,
          variantSku: variant.sku,
          changeType: "order_release",
          qtyChange: Math.abs(item.qty),
          orderCode,
          reason: "payment failed",
          actor,
        },
      ],
      session ? { session } : undefined
    );
  }
};

const deductReservedInventory = async ({ storeId, items, orderCode, session, actor }) => {
  for (const item of items) {
    const product = await StoreProduct.findOne({ storeId, productId: item.productId }).session(session);
    if (!product) throw new Error(`Product not found: ${item.productId}`);

    const variant = resolveVariant(product, item.variantSku);
    if (!variant) throw new Error(`Variant not found for ${item.productId}`);

    const currentReserved = Number(variant.reservedStock || 0);
    const currentStock = Number(variant.stock || 0);
    if (currentReserved < item.qty || currentStock < item.qty) {
      throw new Error(`Stock state invalid for ${product.name}`);
    }

    variant.reservedStock = currentReserved - item.qty;
    variant.stock = currentStock - item.qty;
    await product.save({ session });

    await StoreInventoryLedger.create(
      [
        {
          storeId,
          productId: item.productId,
          variantSku: variant.sku,
          changeType: "order_deduct",
          qtyChange: -Math.abs(item.qty),
          orderCode,
          reason: "payment captured",
          actor,
        },
      ],
      session ? { session } : undefined
    );
  }
};

const formatOrderCode = (sequence) => {
  const year = new Date().getFullYear();
  return `ORD-${year}-${String(sequence).padStart(4, "0")}`;
};

export const createCheckoutOrder = async ({
  storeId,
  customer,
  guestToken,
  shippingAddress,
  billingAddress,
  provider,
  shipping,
  tax,
  customerEmail,
  customerPhone,
}) => {
  const actor = customer?._id ? `customer:${customer.customerId}` : "guest";

  return runWithTransaction(async (session) => {
    const cart = await ensureCart({ storeId, customer, guestToken, session });
    if (!cart.items?.length) throw new Error("Cart is empty");

    const priced = await priceCartItemsFromDb({ storeId, items: cart.items || [], session });
    const pricing = computePricing({
      items: priced.items,
      shipping,
      tax,
      discount: 0,
    });

    const orderId = await getNextStoreSequence({ storeId, key: "orderId", session });
    const orderCode = formatOrderCode(orderId);

    await reserveInventory({
      storeId,
      items: priced.items,
      orderCode,
      session,
      actor,
    });

    const order = await StoreOrder.create(
      [
        {
          storeId,
          orderId,
          orderCode,
          customerId: customer?._id || null,
          customerEmail: customer?.email || customerEmail || "",
          customerPhone: customer?.phone || customerPhone || "",
          items: priced.items,
          pricing: {
            subtotal: pricing.subtotal,
            discount: pricing.discount,
            shipping: pricing.shipping,
            tax: pricing.tax,
            total: pricing.total,
            currency: "INR",
          },
          payment: {
            provider,
            status: provider === "cod" ? "pending" : "created",
          },
          fulfillment: {
            status: provider === "cod" ? "confirmed" : "new",
          },
          shippingAddress,
          billingAddress: billingAddress || shippingAddress,
          source: "web",
        },
      ],
      session ? { session } : undefined
    );

    return withLegacyOrderAliases(order[0].toObject());
  });
};

export const createRazorpayOrder = async ({ storeId, orderCode }) => {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) {
    throw new Error("Razorpay keys missing in environment");
  }

  const order = await StoreOrder.findOne({ storeId, orderCode });
  if (!order) throw new Error("Order not found");

  const amount = Math.round(Number(order.pricing.total || 0) * 100);
  if (amount <= 0) throw new Error("Invalid order amount");

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const resp = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt: order.orderCode,
      payment_capture: 1,
      notes: { orderCode: order.orderCode, storeId },
    }),
  });

  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(`Razorpay order creation failed: ${message}`);
  }

  const rpOrder = await resp.json();
  order.payment.paymentOrderId = rpOrder.id;
  order.payment.status = "created";
  await order.save();

  return {
    key: keyId,
    paymentOrderId: rpOrder.id,
    amount,
    currency: "INR",
    order: withLegacyOrderAliases(order.toObject()),
  };
};

export const verifyCheckoutPayment = async ({
  storeId,
  orderCode,
  paymentOrderId,
  paymentId,
  signature,
  eventId,
  raw,
}) => {
  const dedupeEventId = resolvePaymentEventId({ eventId, paymentId });
  let paymentEvent;

  try {
    paymentEvent = await StorePaymentEvent.create({
      storeId,
      provider: "razorpay",
      eventId: dedupeEventId,
      orderCode,
      payload: raw || { orderCode, paymentOrderId, paymentId },
      status: "received",
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const existing = await StorePaymentEvent.findOne({
      storeId,
      provider: "razorpay",
      eventId: dedupeEventId,
    }).lean();

    return {
      duplicate: true,
      order: existing?.orderCode
        ? await StoreOrder.findOne({ storeId, orderCode: existing.orderCode }).lean()
        : null,
    };
  }

  try {
    const result = await runWithTransaction(async (session) => {
      const order = await StoreOrder.findOne({ storeId, orderCode }).session(session);
      if (!order) throw new Error("Order not found");

      const alreadyCaptured =
        order.payment?.status === "captured" &&
        String(order.payment?.paymentId || "") === String(paymentId);
      if (alreadyCaptured) {
        paymentEvent.status = "duplicate";
        paymentEvent.processedAt = new Date();
        await paymentEvent.save({ session });
        return { duplicate: true, order: withLegacyOrderAliases(order.toObject()) };
      }

      const secret = process.env.RAZORPAY_KEY_SECRET || "";
      const isValid = verifyRazorpaySignature({
        paymentOrderId,
        paymentId,
        signature,
        secret,
      });

      if (!isValid) {
        await releaseInventoryReservation({
          storeId,
          items: order.items,
          orderCode: order.orderCode,
          session,
          actor: "system",
        });

        order.payment.status = "failed";
        order.payment.paymentOrderId = paymentOrderId;
        order.payment.paymentId = paymentId;
        order.payment.signature = signature;
        order.payment.raw = raw || {};
        await order.save({ session });

        paymentEvent.status = "failed";
        paymentEvent.processedAt = new Date();
        await paymentEvent.save({ session });

        throw new Error("Invalid payment signature");
      }

      await deductReservedInventory({
        storeId,
        items: order.items,
        orderCode: order.orderCode,
        session,
        actor: "system",
      });

      order.payment.status = "captured";
      order.payment.paymentOrderId = paymentOrderId;
      order.payment.paymentId = paymentId;
      order.payment.signature = signature;
      order.payment.amountAuthorized = order.pricing.total;
      order.payment.paidAt = new Date();
      order.payment.raw = raw || {};

      order.fulfillment.status = "confirmed";
      await order.save({ session });

      if (order.customerId) {
        await StoreCart.updateOne(
          { storeId, customerId: order.customerId },
          { $set: { items: [], subtotal: 0, total: 0, discountTotal: 0 } },
          session ? { session } : undefined
        );
      }

      paymentEvent.status = "processed";
      paymentEvent.processedAt = new Date();
      await paymentEvent.save({ session });

      return { duplicate: false, order: withLegacyOrderAliases(order.toObject()) };
    });

    return result;
  } catch (error) {
    if (paymentEvent?.status === "received") {
      paymentEvent.status = "failed";
      paymentEvent.processedAt = new Date();
      await paymentEvent.save();
    }
    throw error;
  }
};

export const listCustomerOrders = async ({ storeId, customer, page, limit }) => {
  const filter = {
    storeId,
    customerEmail: customer.email,
  };

  const total = await StoreOrder.countDocuments(filter);
  const docs = await StoreOrder.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    items: docs.map((doc) => withLegacyOrderAliases(doc)),
    pagination: { page, limit, total },
  };
};

export const getCustomerOrderByCode = async ({ storeId, customer, orderCode }) => {
  const order = await StoreOrder.findOne({
    storeId,
    orderCode,
    customerEmail: customer.email,
  }).lean();
  return order ? withLegacyOrderAliases(order) : null;
};

export const createCategory = async ({ storeId, payload }) => {
  const slugBase = payload.slug || toSlug(payload.name);
  let finalSlug = slugBase;
  let counter = 1;

  while (await StoreCategory.findOne({ storeId, slug: finalSlug }).lean()) {
    counter += 1;
    finalSlug = `${slugBase}-${counter}`;
  }

  let level = 0;
  if (payload.parentId) {
    const parent = await StoreCategory.findOne({ storeId, _id: payload.parentId });
    if (!parent) throw new Error("Parent category not found");
    level = Number(parent.level || 0) + 1;
  }

  const category = await StoreCategory.create({
    storeId,
    name: payload.name,
    slug: finalSlug,
    parentId: payload.parentId || null,
    level,
    isActive: payload.isActive,
  });

  return category.toObject();
};

export const updateCategory = async ({ storeId, categoryId, payload }) => {
  const category = await StoreCategory.findOne({ storeId, _id: categoryId });
  if (!category) throw new Error("Category not found");

  if (payload.name && payload.name.trim() !== category.name) {
    const slugBase = toSlug(payload.name);
    let finalSlug = slugBase;
    let counter = 1;

    while (
      await StoreCategory.findOne({
        storeId,
        slug: finalSlug,
        _id: { $ne: category._id },
      }).lean()
    ) {
      counter += 1;
      finalSlug = `${slugBase}-${counter}`;
    }

    category.name = payload.name;
    category.slug = finalSlug;
  }

  if (typeof payload.isActive === "boolean") {
    category.isActive = payload.isActive;
  }

  await category.save();
  return category.toObject();
};

export const deleteCategory = async ({ storeId, categoryId }) => {
  const category = await StoreCategory.findOne({ storeId, _id: categoryId });
  if (!category) return false;

  const childExists = await StoreCategory.exists({ storeId, parentId: category._id });
  if (childExists) {
    throw new Error("Cannot delete category with child categories");
  }

  const hasProducts = await StoreProduct.exists({ storeId, categoryId: category._id });
  if (hasProducts) {
    throw new Error("Cannot delete category that has products");
  }

  await StoreCategory.deleteOne({ _id: category._id, storeId });
  return true;
};

export const createTenantProduct = async ({ storeId, payload }) => {
  const slugBase = payload.slug || toSlug(payload.name);
  let finalSlug = slugBase;
  let counter = 1;

  while (await StoreProduct.findOne({ storeId, slug: finalSlug }).lean()) {
    counter += 1;
    finalSlug = `${slugBase}-${counter}`;
  }

  const category = await StoreCategory.findOne({ storeId, _id: payload.categoryId }).lean();
  if (!category) throw new Error("Category not found");

  const productId = await getNextStoreSequence({ storeId, key: "productId" });
  const productCode = `PRD-${String(productId).padStart(4, "0")}`;

  const product = await StoreProduct.create({
    ...payload,
    storeId,
    productId,
    productCode,
    slug: finalSlug,
  });

  return withLegacyProductAliases(product.toObject());
};

export const updateTenantProduct = async ({ storeId, productId, payload }) => {
  const current = await StoreProduct.findOne({ storeId, productId });
  if (!current) throw new Error("Product not found");

  if (payload.slug || payload.name) {
    const slugBase = payload.slug || toSlug(payload.name);
    let finalSlug = slugBase;
    let counter = 1;
    while (
      await StoreProduct.findOne({
        storeId,
        slug: finalSlug,
        _id: { $ne: current._id },
      }).lean()
    ) {
      counter += 1;
      finalSlug = `${slugBase}-${counter}`;
    }
    payload.slug = finalSlug;
  }

  if (payload.categoryId) {
    const category = await StoreCategory.findOne({ storeId, _id: payload.categoryId }).lean();
    if (!category) throw new Error("Category not found");
  }

  Object.assign(current, payload);
  await current.save();

  return withLegacyProductAliases(current.toObject());
};

export const deleteTenantProduct = async ({ storeId, productId }) => {
  const deleted = await StoreProduct.findOneAndDelete({ storeId, productId }).lean();
  return Boolean(deleted);
};

export const listTenantOrders = async ({ storeId, page, limit, status, paymentStatus }) => {
  const filter = { storeId };
  if (status) filter["fulfillment.status"] = status;
  if (paymentStatus) filter["payment.status"] = paymentStatus;

  const total = await StoreOrder.countDocuments(filter);
  const items = await StoreOrder.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    items: items.map((doc) => withLegacyOrderAliases(doc)),
    pagination: { page, limit, total },
  };
};

export const getTenantOrderById = async ({ storeId, orderId }) => {
  const order = await StoreOrder.findOne({ storeId, orderId }).lean();
  return order ? withLegacyOrderAliases(order) : null;
};

export const updateTenantOrderStatus = async ({ storeId, orderId, status, note }) => {
  const order = await StoreOrder.findOne({ storeId, orderId });
  if (!order) throw new Error("Order not found");

  order.fulfillment.status = status;
  if (note) order.fulfillment.notes = note;
  if (status === "shipped") order.fulfillment.shippedAt = new Date();
  if (status === "delivered") order.fulfillment.deliveredAt = new Date();
  await order.save();

  return withLegacyOrderAliases(order.toObject());
};

export const updateTenantOrderFulfillment = async ({ storeId, orderId, payload }) => {
  const order = await StoreOrder.findOne({ storeId, orderId });
  if (!order) throw new Error("Order not found");

  Object.assign(order.fulfillment, {
    trackingId: payload.trackingId,
    trackingUrl: payload.trackingUrl,
    courier: payload.courier,
    notes: payload.notes,
  });

  if (payload.shippedAt) order.fulfillment.shippedAt = new Date(payload.shippedAt);
  if (payload.deliveredAt) order.fulfillment.deliveredAt = new Date(payload.deliveredAt);

  await order.save();
  return withLegacyOrderAliases(order.toObject());
};

export const listTenantCustomers = async ({ storeId, page, limit, q, status }) => {
  const filter = { storeId };
  if (status) filter.status = status;
  if (q) {
    filter.$or = [
      { email: { $regex: q, $options: "i" } },
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  const total = await StoreCustomer.countDocuments(filter);
  const items = await StoreCustomer.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return { items, pagination: { page, limit, total } };
};

export const updateTenantCustomerStatus = async ({ storeId, customerId, status }) => {
  const customer = await StoreCustomer.findOneAndUpdate(
    { storeId, customerId },
    { $set: { status } },
    { new: true }
  ).lean();

  if (!customer) throw new Error("Customer not found");
  return customer;
};
