import Products from "../model/product.model.js";
import mongoose from "mongoose";
import { Catagories } from "../model/catagory.model.js";
import Reviews from "../model/review.model.js";
import Addresses from "../model/addresses.model.js";
import { getNextSequence } from "../model/counter.model.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import Profile from "../model/profile.model.js";
import Wishlist from "../model/wishlist.model.js";
import Orders from "../model/orders.model.js";
import StoreSettings from "../model/storeSettings.model.js";
import CartState from "../model/cartState.model.js";

const parsePageLimit = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(Math.min(parseInt(req.query.limit || "12", 10), 100), 1);
  return { page, limit };
};

const cleanUrl = (value) => {
  const text = String(value || "").trim();
  if (!text || text === "#") return "";
  return text;
};

const resolveStoreId = (req) =>
  String(
    req.headers["x-store-id"] ||
    req.query?.storeId ||
    req.body?.storeId ||
    process.env.DEFAULT_STORE_ID ||
    process.env.STORE_ID ||
    "default-store"
  ).trim();

const shapeStoreConfig = (doc, storeId) => {
  const resolvedStoreId = String(doc?.storeId || storeId || "default-store").trim() || "default-store";
  const storeName = String(doc?.storeName || "").trim();
  const navbarTitle = String(doc?.navbarTitle || "").trim() || storeName;
  const footerTitle = String(doc?.footerTitle || "").trim() || storeName;
  const currencySymbol =
    String(doc?.currencySymbol ?? doc?.currency ?? doc?.currency_symbol ?? "₹").trim() || "₹";
  return {
    storeId: resolvedStoreId,
    storeName: storeName || navbarTitle || footerTitle || "Store",
    navbarTitle: navbarTitle || storeName || "Store",
    footerTitle: footerTitle || storeName || "Store",
    footerDescription: String(doc?.footerDescription || "").trim(),
    email: String(doc?.companyEmail || doc?.email || "").trim(),
    phone: String(doc?.phone || "").trim(),
    address: String(doc?.companyAddress || doc?.address || "").trim(),
    currencySymbol,
    social: {
      instagramUrl: cleanUrl(doc?.instagramUrl ?? doc?.instagram_url),
      facebookUrl: cleanUrl(doc?.facebookUrl ?? doc?.facebook_url),
      twitterUrl: cleanUrl(doc?.twitterUrl ?? doc?.twitter_url),
      youtubeUrl: cleanUrl(doc?.youtubeUrl ?? doc?.youtube_url),
      linkedinUrl: cleanUrl(doc?.linkedinUrl ?? doc?.linkedin_url),
    },
  };
};

const findStoreSettingsFromRawCollections = async (storeId) => {
  const db = mongoose.connection?.db;
  if (!db) return null;

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = listed.map((item) => String(item?.name || "")).filter(Boolean);
  if (!names.length) return null;

  const preferred = [
    "storesettings",
    "store_settings",
    "storeSettings",
    "storeconfigs",
    "store_configs",
    "storeprofiles",
    "store_profiles",
  ];

  const byPreference = preferred
    .map((name) => names.find((entry) => entry.toLowerCase() === name.toLowerCase()))
    .filter(Boolean);

  const inferred = names.filter((entry) => /store/i.test(entry));
  const candidates = Array.from(new Set([...byPreference, ...inferred]));

  for (const collectionName of candidates) {
    const collection = db.collection(collectionName);
    const exact = await collection.findOne({ storeId });
    if (exact) return exact;
    const latest = await collection.find({}).sort({ updatedAt: -1, createdAt: -1 }).limit(1).next();
    if (latest) return latest;
  }

  return null;
};

const findProductFromRawCollections = async ({ idParam, numericId }) => {
  const db = mongoose.connection?.db;
  if (!db) return null;

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = listed.map((item) => String(item?.name || "")).filter((name) => /product/i.test(name));
  if (!names.length) return null;

  for (const collectionName of names) {
    const collection = db.collection(collectionName);

    if (Number.isFinite(numericId) && numericId > 0) {
      const byNumeric = await collection.findOne({
        $or: [{ product_id: numericId }, { productId: numericId }],
      });
      if (byNumeric) return byNumeric;
    }

    if (mongoose.Types.ObjectId.isValid(idParam)) {
      const byObjectId = await collection.findOne({ _id: new mongoose.Types.ObjectId(idParam) });
      if (byObjectId) return byObjectId;
    }
  }

  return null;
};

const shapeLegacyProduct = (raw = {}) => {
  const productId = Number(raw?.product_id ?? raw?.productId ?? 0);
  const images = Array.isArray(raw?.product_image)
    ? raw.product_image
    : Array.isArray(raw?.media?.images)
      ? raw.media.images
      : Array.isArray(raw?.images)
        ? raw.images
        : [];

  const mrp = Number(raw?.price ?? raw?.mrp ?? 0) || 0;
  const selling = Number(raw?.selling_price ?? raw?.salePrice ?? raw?.discountedPrice ?? mrp) || mrp;

  return {
    ...raw,
    product_id: productId > 0 ? productId : undefined,
    name: String(raw?.name || raw?.title || "").trim(),
    title: String(raw?.title || raw?.name || "").trim(),
    price: mrp,
    selling_price: selling,
    product_image: images,
    catagory_id: raw?.catagory_id || raw?.categoryId || raw?.category_id || "",
    category: String(raw?.category || raw?.categoryName || raw?.Catagory?.name || "").trim(),
  };
};

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ORDER_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const buildRandomPublicOrderId = () => {
  const letterCount = 4 + Math.floor(Math.random() * 2); // 4 or 5 chars
  let letters = "";
  for (let i = 0; i < letterCount; i += 1) {
    letters += ORDER_ID_ALPHABET[Math.floor(Math.random() * ORDER_ID_ALPHABET.length)];
  }
  const digits = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  return `${letters}-${digits}`;
};

const normalizePaymentStatus = (value) => {
  const raw = String(value || "").toLowerCase();
  if (!raw) return "pending";
  if (["captured", "paid", "authorized"].includes(raw)) return "paid";
  if (["failed", "cancelled"].includes(raw)) return raw;
  return raw;
};

const normalizeTenantOrderDoc = (doc, productLookup = new Map(), productLookupByRef = new Map()) => {
  const items = Array.isArray(doc?.items)
    ? doc.items.map((item) => {
      const productId = Number(item?.product_id ?? item?.productId ?? 0);
      const productRef = String(item?.product || item?.productRef || "").trim();
      const productDoc = productLookup.get(productId) || productLookupByRef.get(productRef);
      const qty = Math.max(1, Number(item?.quantity ?? item?.qty ?? 1) || 1);
      const directPrice = toPositiveNumber(item?.price ?? item?.unitPrice ?? item?.unit_price);
      const lineTotal = toPositiveNumber(item?.lineTotal ?? item?.line_total);
      const resolvedPrice = directPrice || (lineTotal && qty ? lineTotal / qty : 0);
      const mediaImage = Array.isArray(productDoc?.media?.images) ? productDoc.media.images[0] : "";
      const productImage = Array.isArray(productDoc?.product_image)
        ? productDoc.product_image[0]
        : productDoc?.product_image || mediaImage || "";

      return {
        product_id: productId || undefined,
        product: item?.product || item?.productRef,
        quantity: qty,
        price: resolvedPrice,
        title: String(item?.title || item?.nameSnapshot || item?.name || productDoc?.title || productDoc?.name || "").trim(),
        image: String(item?.image || item?.imageSnapshot || productImage || "").trim(),
        color: String(item?.color || "").trim(),
        size: String(item?.size || "").trim(),
      };
    })
    : [];

  const pricingTotal = toPositiveNumber(doc?.pricing?.total);
  const fallbackItemsTotal = items.reduce(
    (sum, item) => sum + toPositiveNumber(item?.price) * (Number(item?.quantity) || 1),
    0
  );
  const rawAmount = toPositiveNumber(pricingTotal || doc?.amount);
  const amount =
    rawAmount && rawAmount > 1000 && fallbackItemsTotal > 0 && rawAmount / 100 === fallbackItemsTotal
      ? rawAmount / 100
      : rawAmount;

  const rawOrderId =
    doc?.order_id ?? doc?.orderId ?? doc?.order_code ?? doc?.orderCode ?? doc?._id;
  const orderId = String(rawOrderId || "").trim() || undefined;

  return {
    _id: doc?._id,
    order_id: orderId,
    status: doc?.status || doc?.fulfillment?.status || "pending",
    payment_status: doc?.payment_status || normalizePaymentStatus(doc?.payment?.status),
    payment_method: doc?.payment_method || doc?.payment?.provider || "Razorpay",
    amount: amount || fallbackItemsTotal,
    currency: doc?.currency || doc?.pricing?.currency || "INR",
    razorpay_order_id: doc?.razorpay_order_id || doc?.payment?.paymentOrderId || "",
    razorpay_payment_id: doc?.razorpay_payment_id || doc?.payment?.paymentId || "",
    razorpay_signature: doc?.razorpay_signature || doc?.payment?.signature || "",
    items,
    user_email: doc?.user_email || doc?.customerEmail || "",
    FullName: doc?.FullName || doc?.shippingAddress?.fullName || "",
    phone1: doc?.phone1 || doc?.shippingAddress?.phone || "",
    phone2: doc?.phone2 || "",
    address_line1: doc?.address_line1 || doc?.shippingAddress?.line1 || "",
    city: doc?.city || doc?.shippingAddress?.city || "",
    state: doc?.state || doc?.shippingAddress?.state || "",
    country: doc?.country || doc?.shippingAddress?.country || "",
    pinCode: doc?.pinCode || doc?.shippingAddress?.postalCode || "",
    addressType: doc?.addressType || "",
    createdAt: doc?.createdAt,
    updatedAt: doc?.updatedAt,
    _source: "tenant",
  };
};

const getTenantOrdersFromCollections = async (email) => {
  const safeEmail = String(email || "").trim().toLowerCase();
  if (!safeEmail) return [];

  const db = mongoose.connection?.db;
  if (!db) return [];

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = listed.map((item) => String(item?.name || "")).filter(Boolean);
  if (!names.length) return [];

  const byLower = new Map(names.map((name) => [name.toLowerCase(), name]));
  const preferred = ["tenantorders", "storeorders", "tenantorder", "storeorder"];
  const candidates = preferred
    .map((name) => byLower.get(name.toLowerCase()))
    .filter(Boolean);
  if (!candidates.length) return [];

  const emailRegex = new RegExp(`^${escapeRegex(safeEmail)}$`, "i");

  const allDocs = [];
  for (const name of candidates) {
    const docs = await db
      .collection(name)
      .find({
        $or: [
          { user_email: emailRegex },
          { customerEmail: emailRegex },
          { email: emailRegex },
          { customer_email: emailRegex },
          { "customer.email": emailRegex },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();
    allDocs.push(...docs);
  }

  const dedupedDocs = [];
  const seen = new Set();
  for (const doc of allDocs) {
    const key = String(doc?._id || doc?.order_id || doc?.orderId || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedupedDocs.push(doc);
  }

  dedupedDocs.sort((a, b) => {
    const aTime = new Date(a?.createdAt || 0).getTime();
    const bTime = new Date(b?.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const productIds = Array.from(
    new Set(
      dedupedDocs
        .flatMap((doc) => (Array.isArray(doc?.items) ? doc.items : []))
        .map((item) => Number(item?.product_id ?? item?.productId ?? 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  const productRefIds = Array.from(
    new Set(
      dedupedDocs
        .flatMap((doc) => (Array.isArray(doc?.items) ? doc.items : []))
        .map((item) => String(item?.product || item?.productRef || "").trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  ).map((id) => new mongoose.Types.ObjectId(id));

  const productLookup = new Map();
  const productLookupByRef = new Map();

  if (db && (productIds.length || productRefIds.length)) {
    const productCollectionNames = names
      .filter((name) => /product/i.test(name));

    for (const collectionName of productCollectionNames) {
      const filter = {
        $or: [
          ...(productIds.length ? [{ product_id: { $in: productIds } }, { productId: { $in: productIds } }] : []),
          ...(productRefIds.length ? [{ _id: { $in: productRefIds } }] : []),
        ],
      };
      if (!filter.$or.length) continue;

      const docs = await db
        .collection(collectionName)
        .find(filter)
        .project({ product_id: 1, productId: 1, title: 1, name: 1, product_image: 1, media: 1 })
        .toArray();

      docs.forEach((doc) => {
        const pid = Number(doc?.product_id ?? doc?.productId ?? 0);
        if (pid > 0 && !productLookup.has(pid)) {
          productLookup.set(pid, doc);
        }
        const ref = String(doc?._id || "").trim();
        if (ref && !productLookupByRef.has(ref)) {
          productLookupByRef.set(ref, doc);
        }
      });
    }
  }

  return dedupedDocs.map((doc) => normalizeTenantOrderDoc(doc, productLookup, productLookupByRef));
};

const TENANT_ORDER_COLLECTION_PREFERENCE = [
  "tenantorders",
  "storeorders",
  "tenantorder",
  "storeorder",
];

const resolveTenantOrderCollectionName = async () => {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("Database not connected");

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = listed.map((item) => String(item?.name || "")).filter(Boolean);
  const byLower = new Map(names.map((name) => [name.toLowerCase(), name]));

  for (const preferredName of TENANT_ORDER_COLLECTION_PREFERENCE) {
    const resolvedName = byLower.get(preferredName.toLowerCase());
    if (resolvedName) return resolvedName;
  }

  return TENANT_ORDER_COLLECTION_PREFERENCE[0];
};

const doesPublicOrderIdExist = async (publicOrderId) => {
  const db = mongoose.connection?.db;
  if (!db) return false;

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = listed.map((item) => String(item?.name || "")).filter(Boolean);
  const candidates = Array.from(
    new Set([...TENANT_ORDER_COLLECTION_PREFERENCE, "orders", ...names.filter((name) => /order/i.test(name))])
  );

  for (const name of candidates) {
    if (!names.some((entry) => entry.toLowerCase() === String(name).toLowerCase())) continue;
    const collectionName = names.find((entry) => entry.toLowerCase() === String(name).toLowerCase()) || name;
    const match = await db.collection(collectionName).findOne({
      $or: [
        { order_id: publicOrderId },
        { orderId: publicOrderId },
        { order_code: publicOrderId },
        { orderCode: publicOrderId },
      ],
    });
    if (match) return true;
  }
  return false;
};

const generateUniquePublicOrderId = async (maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = buildRandomPublicOrderId();
    const exists = await doesPublicOrderIdExist(candidate);
    if (!exists) return candidate;
  }
  throw new Error("Unable to generate unique order id");
};

const insertTenantOrder = async ({
  req,
  publicOrderId,
  razorpayOrder,
  payload,
  orderItems,
  addressDoc,
  email,
}) => {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("Database not connected");

  const collectionName = await resolveTenantOrderCollectionName();
  const storeId = resolveStoreId(req);
  const amountRupees = Math.round(Number(payload?.amount || 0) / 100);
  const orderCode = publicOrderId;
  const now = new Date();

  const shippingAddress = {
    fullName: addressDoc?.FullName || addressDoc?.full_name || "",
    line1: addressDoc?.address_line1 || addressDoc?.address || "",
    city: addressDoc?.city || "",
    state: addressDoc?.state || "",
    country: addressDoc?.country || "India",
    postalCode: addressDoc?.pinCode || addressDoc?.postal_code || "",
    phone: addressDoc?.phone1 || addressDoc?.phone || "",
  };

  const items = orderItems.map((item) => {
    const qty = Math.max(1, Number(item?.quantity ?? item?.qty ?? 1) || 1);
    const unitPrice = toPositiveNumber(item?.price);
    return {
      ...item,
      qty,
      quantity: qty,
      price: unitPrice,
      lineTotal: unitPrice * qty,
    };
  });

  const tenantOrderDoc = {
    storeId,
    source: "legacy-user-create-order",
    orderId: publicOrderId,
    order_id: publicOrderId,
    orderCode,
    order_code: orderCode,
    status: "pending",
    fulfillment: {
      status: "new",
    },
    payment_status: "created",
    payment_method: "Razorpay",
    payment: {
      provider: "razorpay",
      status: "created",
      paymentOrderId: razorpayOrder?.id || "",
    },
    amount: amountRupees,
    currency: payload?.currency || "INR",
    pricing: {
      subtotal: amountRupees,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: amountRupees,
      currency: payload?.currency || "INR",
    },
    razorpay_order_id: razorpayOrder?.id || "",
    razorpay_payment_id: "",
    razorpay_signature: "",
    items,
    user_email: email || "",
    customerEmail: email || "",
    customer: {
      email: email || "",
    },
    FullName: shippingAddress.fullName,
    phone1: shippingAddress.phone,
    phone2: addressDoc?.phone2 || addressDoc?.alt_phone || "",
    address_line1: shippingAddress.line1,
    city: shippingAddress.city,
    state: shippingAddress.state,
    country: shippingAddress.country,
    pinCode: shippingAddress.postalCode,
    addressType: addressDoc?.addressType || "",
    shippingAddress,
    billingAddress: shippingAddress,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(collectionName).insertOne(tenantOrderDoc);
  return { collectionName, orderCode };
};

const markTenantOrderPaymentCaptured = async ({
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) => {
  const db = mongoose.connection?.db;
  if (!db) return null;

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = listed.map((item) => String(item?.name || "")).filter(Boolean);
  const byLower = new Map(names.map((name) => [name.toLowerCase(), name]));
  const candidates = TENANT_ORDER_COLLECTION_PREFERENCE
    .map((name) => byLower.get(name.toLowerCase()))
    .filter(Boolean);

  if (!candidates.length) return null;

  const lookupFilter = {
    $or: [
      { razorpay_order_id },
      { "payment.paymentOrderId": razorpay_order_id },
    ],
  };

  for (const collectionName of candidates) {
    const collection = db.collection(collectionName);
    const existing = await collection.findOne(lookupFilter);
    if (!existing) continue;

    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: "confirmed",
          payment_status: "paid",
          razorpay_payment_id,
          razorpay_signature,
          "fulfillment.status": "confirmed",
          "payment.status": "captured",
          "payment.paymentId": razorpay_payment_id,
          "payment.signature": razorpay_signature,
          "payment.paidAt": new Date(),
          updatedAt: new Date(),
        },
      }
    );

    const updated = await collection.findOne({ _id: existing._id });
    if (!updated) return null;
    return {
      order: updated,
      collectionName,
    };
  }

  return null;
};

const cancelTenantOrderIfExists = async (idStr) => {
  const db = mongoose.connection?.db;
  if (!db) return null;

  const listed = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = listed.map((item) => String(item?.name || "")).filter(Boolean);
  const byLower = new Map(names.map((name) => [name.toLowerCase(), name]));
  const candidates = TENANT_ORDER_COLLECTION_PREFERENCE
    .map((name) => byLower.get(name.toLowerCase()))
    .filter(Boolean);
  if (!candidates.length) return null;

  const isNumericId = !Number.isNaN(Number(idStr)) && Number.isFinite(Number(idStr));
  const numericId = Number(idStr);
  const tenantFilters = [];
  if (isNumericId) {
    tenantFilters.push({ order_id: numericId });
    tenantFilters.push({ orderId: numericId });
  }
  tenantFilters.push({ order_id: idStr });
  tenantFilters.push({ orderId: idStr });
  tenantFilters.push({ order_code: idStr });
  tenantFilters.push({ orderCode: idStr });
  if (mongoose.Types.ObjectId.isValid(idStr)) {
    tenantFilters.push({ _id: new mongoose.Types.ObjectId(idStr) });
  }
  tenantFilters.push({ _id: idStr });

  for (const collectionName of candidates) {
    const collection = db.collection(collectionName);
    const existing = await collection.findOne({ $or: tenantFilters });
    if (!existing) continue;

    const finalStatuses = ["cancelled", "rejected", "delivered", "rto"];
    const currentStatus = String(existing?.status || existing?.fulfillment?.status || "").toLowerCase();
    if (finalStatuses.includes(currentStatus)) {
      return {
        blocked: true,
        message: `Order already ${existing.status || currentStatus}`,
      };
    }

    const paidStatus = normalizePaymentStatus(existing?.payment_status || existing?.payment?.status) === "paid";
    const nextPaymentStatus = paidStatus ? "refund_pending" : "cancelled";

    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: "cancelled",
          payment_status: nextPaymentStatus,
          "fulfillment.status": "cancelled",
          "payment.status": nextPaymentStatus,
          updatedAt: new Date(),
        },
      }
    );

    const updated = await collection.findOne({ _id: existing._id });
    return {
      blocked: false,
      order: updated,
      collectionName,
    };
  }

  return null;
};

export const showProducts = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const total = await Products.countDocuments({});
    const products = await Products.find({})
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    return res.status(200).json({
      status: true,
      products,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("showProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getStoreConfig = async (req, res) => {
  try {
    const storeId = resolveStoreId(req);
    let settings = await StoreSettings.findOne({ storeId }).lean();
    if (!settings) {
      settings = await StoreSettings.findOne({}).sort({ updatedAt: -1 }).lean();
    }
    if (!settings) {
      settings = await findStoreSettingsFromRawCollections(storeId);
    }
    return res.status(200).json({
      status: true,
      data: shapeStoreConfig(settings || {}, storeId),
    });
  } catch (error) {
    console.error("getStoreConfig error:", error);
    return res.status(500).json({ status: false, message: "Failed to load store config" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const idParam = req.params.id;
    const numericId = Number(idParam);

    let product = null;
    if (Number.isFinite(numericId) && numericId > 0) {
      product = await Products.findOne({ product_id: numericId });
    }
    if (!product && mongoose.Types.ObjectId.isValid(idParam)) {
      product = await Products.findById(idParam);
    }

    if (!product) {
      product = await findProductFromRawCollections({ idParam, numericId });
    }

    if (!product) {
      return res
        .status(200)
        .json({ status: 404, data: [], message: "Product not found" });
    }

    const productObj = typeof product?.toObject === "function" ? product.toObject() : product;
    const shaped = shapeLegacyProduct(productObj);

    const categoryId = String(shaped?.catagory_id || "").trim();
    const cat =
      categoryId && mongoose.Types.ObjectId.isValid(categoryId)
        ? await Catagories.findById(categoryId).lean()
        : null;

    if (cat) {
      shaped.Catagory = { id: 1, name: cat.name };
    } else if (shaped.category) {
      shaped.Catagory = { id: 1, name: shaped.category };
    }

    return res.status(200).json({ status: 200, data: [shaped] });
  } catch (error) {
    console.error("getProductById error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getProductByCategory = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const categoryName = req.params.category;
    const category = await Catagories.findOne({ name: categoryName });
    if (!category) {
      return res.status(200).json({ status: true, products: [], pagination: { page, limit, total: 0 } });
    }

    const filter = { catagory_id: category._id };
    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      status: true,
      products,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("getProductByCategory error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const { search = "", price, page = 1, limit = 12 } = req.body || {};
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.max(Math.min(parseInt(limit, 10), 100), 1);

    const q = search.trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    if (price) {
      filter.price = { $lte: Number(price) };
    }

    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return res.status(200).json({
      status: true,
      products,
      pagination: { page: pageNum, limit: limitNum, total },
    });
  } catch (error) {
    console.error("searchProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getCategories = async (_req, res) => {
  try {
    const categories = await Catagories.find({}).sort({ name: 1 });
    return res.status(200).json({ status: true, categories });
  } catch (error) {
    console.error("getCategories (user) error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const addProductReview = async (req, res) => {
  try {
    const {
      product_id,
      review_rate,
      review_text,
      review_title,
      user_name,
      email,
      user_email,
    } = req.body || {};

    const pid = Number(product_id);
    const ratingNum = Number(review_rate);
    if (!pid || Number.isNaN(pid)) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ status: false, message: "rating 1-5 required" });
    }

    // Resolve display name priority: profile.name (by email) > provided user_name > email local-part > Anonymous
    const emailVal = (email || user_email || "").trim();
    let displayName = (user_name || "").trim();
    if (!displayName && emailVal) {
      const profile = await Profile.findOne({ email: emailVal }).lean();
      displayName = profile?.name?.trim() || "";
      if (!displayName) {
        displayName = emailVal.split("@")[0] || "";
      }
    }
    if (!displayName) displayName = "Anonymous";

    let imageUrl = "";
    if (req.file && req.file.buffer) {
      try {
        const uploadRes = await uploadToCloudinary(
          req.file.buffer,
          `${pid}-${Date.now()}`,
          req.file.mimetype || "image/jpeg"
        );
        imageUrl = uploadRes.secure_url || uploadRes.url || "";
      } catch (err) {
        console.error("Cloudinary review upload failed:", err);
        return res.status(500).json({ status: false, message: "Image upload failed" });
      }
    }

    const review = await Reviews.create({
      product_id: pid,
      rating: ratingNum,
      comment: review_text || "",
      user: displayName,
      review_title: review_title || "",
      review_image: imageUrl,
    });

    const shaped = {
      id: review._id,
      review_rate: review.rating,
      review_text: review.comment,
      review_title: review.review_title,
      review_image: review.review_image,
      user_name: review.user,
      createdAt: review.createdAt,
    };

    return res.status(201).json({ status: true, review: shaped, message: "Review added" });
  } catch (error) {
    console.error("addProductReview error:", error);
    return res.status(500).json({ status: false, message: "Failed to add review" });
  }
};

export const getProductReviews = async (req, res) => {
  try {
    const pid = Number(req.params.id);
    const reviews = await Reviews.find({ product_id: pid }).sort({
      createdAt: -1,
    });
    const mapped = reviews.map((r) => ({
      id: r._id,
      review_rate: r.rating,
      review_text: r.comment,
      review_title: r.review_title,
      review_image: r.review_image,
      user_name: r.user || "Anonymous",
      createdAt: r.createdAt,
    }));
    return res.status(200).json({ status: true, reviews: mapped });
  } catch (error) {
    console.error("getProductReviews error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// --- Minimal user/cart/address stubs to satisfy frontend ---
const makeCartId = () => `cart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeCartItem = (item = {}) => {
  const productId = Number(item?.product_id ?? item?.productId ?? 0);
  const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
  const price = Number(item?.price || 0) || 0;
  const mrp = Number(item?.mrp ?? item?.price ?? 0) || 0;
  return {
    product_id: productId,
    qty,
    price,
    mrp,
    title: String(item?.title || "").trim(),
    image: String(item?.image || "").trim(),
    color: String(item?.color || "").trim(),
    size: String(item?.size || "").trim(),
  };
};

const findCartById = async (cartId) => {
  const safeId = String(cartId || "").trim();
  if (!safeId) return null;
  return CartState.findOne({ cart_id: safeId });
};

const ensureCart = async (cartIdFromReq) => {
  const existing = await findCartById(cartIdFromReq);
  if (existing) return existing;

  const desiredId = String(cartIdFromReq || "").trim() || makeCartId();
  const created = await CartState.create({ cart_id: desiredId, items: [] });
  return created;
};

const toCartResponse = (cartDoc) => ({
  status: true,
  cart_id: cartDoc?.cart_id || "",
  items: Array.isArray(cartDoc?.items) ? cartDoc.items : [],
});

export const getUserCart = async (req, res) => {
  try {
    const cartId = String(req.body?.cart_id || req.body?.cartId || "").trim();
    if (!cartId) {
      return res.status(200).json({ status: true, cart_id: "", items: [] });
    }

    const cart = await findCartById(cartId);
    if (!cart) {
      return res.status(200).json({ status: true, cart_id: cartId, items: [] });
    }

    return res.status(200).json(toCartResponse(cart));
  } catch (error) {
    console.error("getUserCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to load cart" });
  }
};

export const saveUserCart = async (req, res) => {
  try {
    const cartId = String(req.body?.cart_id || req.body?.cartId || "").trim();
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = incoming
      .map(normalizeCartItem)
      .filter((item) => Number.isFinite(item.product_id) && item.product_id > 0);

    const cart = await ensureCart(cartId);
    cart.items = items;
    await cart.save();

    return res.status(200).json(toCartResponse(cart));
  } catch (error) {
    console.error("saveUserCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to save cart" });
  }
};

export const addToCart = async (req, res) => {
  try {
    const payload = normalizeCartItem(req.body || {});
    if (!Number.isFinite(payload.product_id) || payload.product_id <= 0) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }

    const cartId = String(req.body?.cart_id || req.body?.cartId || "").trim();
    const cart = await ensureCart(cartId);

    const matchIndex = (cart.items || []).findIndex(
      (item) =>
        Number(item?.product_id) === payload.product_id &&
        String(item?.color || "").trim().toLowerCase() === payload.color.toLowerCase() &&
        String(item?.size || "").trim().toUpperCase() === payload.size.toUpperCase()
    );

    if (matchIndex >= 0) {
      cart.items[matchIndex].qty = Math.max(1, Number(cart.items[matchIndex].qty || 1)) + payload.qty;
      cart.items[matchIndex].price = payload.price || cart.items[matchIndex].price || 0;
      cart.items[matchIndex].mrp = payload.mrp || cart.items[matchIndex].mrp || payload.price || 0;
      if (payload.title) cart.items[matchIndex].title = payload.title;
      if (payload.image) cart.items[matchIndex].image = payload.image;
    } else {
      cart.items.push(payload);
    }

    await cart.save();
    return res.status(200).json(toCartResponse(cart));
  } catch (error) {
    console.error("addToCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to add to cart" });
  }
};

export const removeCartByProduct = async (req, res) => {
  try {
    const cartId = String(req.query?.cart_id || req.query?.cartId || "").trim();
    const productId = Number(req.params?.productId || 0);
    if (!cartId) {
      return res.status(400).json({ status: false, message: "cart_id required" });
    }
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ status: false, message: "productId required" });
    }

    const color = String(req.query?.color || "").trim().toLowerCase();
    const size = String(req.query?.size || "").trim().toUpperCase();
    const cart = await findCartById(cartId);
    if (!cart) {
      return res.status(200).json({ status: true, cart_id: cartId, items: [] });
    }

    cart.items = (cart.items || []).filter((item) => {
      const sameProduct = Number(item?.product_id) === productId;
      if (!sameProduct) return true;
      if (!color && !size) return false;
      const sameColor = String(item?.color || "").trim().toLowerCase() === color;
      const sameSize = String(item?.size || "").trim().toUpperCase() === size;
      return !(sameColor && sameSize);
    });

    await cart.save();
    return res.status(200).json(toCartResponse(cart));
  } catch (error) {
    console.error("removeCartByProduct error:", error);
    return res.status(500).json({ status: false, message: "Failed to remove item" });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const cartId = String(req.body?.cart_id || req.body?.cartId || "").trim();
    const productId = Number(req.body?.product_id || req.body?.productId || 0);
    const nextQty = Math.max(0, Number(req.body?.qty ?? req.body?.quantity ?? 0) || 0);

    if (!cartId) {
      return res.status(400).json({ status: false, message: "cart_id required" });
    }
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }

    const color = String(req.body?.color || "").trim().toLowerCase();
    const size = String(req.body?.size || "").trim().toUpperCase();
    const cart = await findCartById(cartId);
    if (!cart) {
      return res.status(200).json({ status: true, cart_id: cartId, items: [] });
    }

    const matchIndex = (cart.items || []).findIndex(
      (item) =>
        Number(item?.product_id) === productId &&
        String(item?.color || "").trim().toLowerCase() === color &&
        String(item?.size || "").trim().toUpperCase() === size
    );

    if (matchIndex >= 0) {
      if (nextQty <= 0) {
        cart.items.splice(matchIndex, 1);
      } else {
        cart.items[matchIndex].qty = nextQty;
      }
      await cart.save();
    }

    return res.status(200).json(toCartResponse(cart));
  } catch (error) {
    console.error("updateCartItem error:", error);
    return res.status(500).json({ status: false, message: "Failed to update item" });
  }
};

export const clearCart = async (req, res) => {
  try {
    const cartId = String(req.body?.cart_id || req.body?.cartId || "").trim();
    if (!cartId) {
      return res.status(200).json({ status: true, cart_id: "", items: [] });
    }

    const cart = await findCartById(cartId);
    if (!cart) {
      return res.status(200).json({ status: true, cart_id: cartId, items: [] });
    }

    cart.items = [];
    await cart.save();
    return res.status(200).json(toCartResponse(cart));
  } catch (error) {
    console.error("clearCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to clear cart" });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const email = req.body?.email || "user@example.com";
    const profile =
      (await Profile.findOne({ email }).lean()) || { email, name: "" };
    return res.status(200).json({ status: true, profile });
  } catch (error) {
    console.error("getUserProfile error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to load profile" });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const { email = "user@example.com", name = "" } = req.body || {};
    const profile = await Profile.findOneAndUpdate(
      { email },
      { email, name },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.status(200).json({ status: true, profile });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to update profile" });
  }
};

// --- Wishlist helpers ---
const requireEmail = (req, res) => {
  const email = (req.body?.email || "").trim();
  if (!email) {
    res.status(401).json({ status: false, message: "Email required (auth)" });
    return null;
  }
  return email;
};

export const listWishlist = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const items = await Wishlist.find({ email }).lean();
    const ids = items.map((i) => i.product_id);
    const products = await Products.find({ product_id: { $in: ids } }).lean();
    return res.status(200).json({ status: true, products });
  } catch (error) {
    console.error("listWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to load wishlist" });
  }
};

export const addToWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    await Wishlist.updateOne(
      { email, product_id: pid },
      { $set: { email, product_id: pid } },
      { upsert: true }
    );
    return listWishlist(req, res);
  } catch (error) {
    console.error("addToWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to add to wishlist" });
  }
};

export const removeFromWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    await Wishlist.deleteOne({ email, product_id: pid });
    return listWishlist(req, res);
  } catch (error) {
    console.error("removeFromWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to remove from wishlist" });
  }
};

export const clearWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    await Wishlist.deleteMany({ email });
    return res.status(200).json({ status: true, products: [] });
  } catch (error) {
    console.error("clearWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to clear wishlist" });
  }
};

// --- Orders (stub) ---
export const getUserOrders = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim();
    if (!email) {
      return res.status(400).json({ status: false, message: "email required" });
    }

    const tenantOrders = await getTenantOrdersFromCollections(email);
    if (tenantOrders.length) {
      return res.status(200).json({ status: true, orders: tenantOrders });
    }

    const filter = email ? { user_email: email } : {};
    const legacyOrders = await Orders.find(filter)
      .populate({ path: "items.product", select: "name title price selling_price product_image" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 })
      .lean();

    const normalizedLegacyOrders = legacyOrders.map((order) => ({
      ...order,
      _source: "legacy",
    }));

    return res.status(200).json({ status: true, orders: normalizedLegacyOrders });
  } catch (error) {
    console.error("getUserOrders error:", error);
    return res.status(500).json({ status: false, message: "Failed to load orders" });
  }
};

// Razorpay order creation
export const createOrder = async (req, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(500).json({ status: false, message: "Razorpay keys missing in env" });
    }

    const { items = [], address_id, email } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: false, message: "Items required" });
    }

    const toPositive = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };

    const normalizedItems = items.map((item) => ({
      raw: item,
      productId: Number(item?.product_id ?? item?.productId ?? 0),
      qty: Math.max(1, Number(item?.quantity ?? item?.qty ?? 1) || 1),
      fallbackPrice: toPositive(item?.price ?? item?.selling_price ?? item?.mrp),
    }));

    // fetch product prices
    const ids = normalizedItems.map((i) => i.productId).filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) {
      return res.status(400).json({ status: false, message: "No valid product ids found" });
    }
    const products = await Products.find({ product_id: { $in: ids } }).lean();
    const productMap = new Map(products.map((p) => [p.product_id, p]));

    let amountPaise = 0;
    const orderItems = [];
    for (const item of normalizedItems) {
      const prod = productMap.get(item.productId);
      const catalogPrice = toPositive(prod?.selling_price ?? prod?.price ?? prod?.mrp);
      const unitPrice = catalogPrice || item.fallbackPrice;

      if (!unitPrice) {
        return res.status(400).json({
          status: false,
          message: `Unable to determine price for product ${item.productId}`,
        });
      }

      amountPaise += Math.round(unitPrice * item.qty * 100);
      orderItems.push({
        product_id: item.productId,
        quantity: item.qty,
        price: unitPrice,
        product: prod?._id,
        title: String(item.raw?.title || prod?.title || prod?.name || "Product").trim(),
        image: String(
          item.raw?.image ||
          (Array.isArray(prod?.product_image) ? prod?.product_image?.[0] : prod?.product_image) ||
          ""
        ).trim(),
        color: String(item.raw?.color || "").trim(),
        size: String(item.raw?.size || "").trim(),
      });
    }

    if (!orderItems.length || amountPaise <= 0) {
      return res.status(400).json({ status: false, message: "Unable to price cart items" });
    }

    const payload = {
      amount: Math.round(amountPaise),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: { address_id: address_id || "" },
    };

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    if (!rpRes.ok) {
      const text = await rpRes.text();
      throw new Error(`Razorpay order failed: ${rpRes.status} ${text}`);
    }
    const order = await rpRes.json();

    const addressDoc = address_id
      ? await Addresses.findOne({ address_id: Number(address_id) })
      : null;

    const publicOrderId = await generateUniquePublicOrderId();
    const { collectionName } = await insertTenantOrder({
      req,
      publicOrderId,
      razorpayOrder: order,
      payload,
      orderItems,
      addressDoc,
      email,
    });

    return res.status(200).json({
      status: true,
      order,
      key: keyId,
      amount: payload.amount,
      currency: payload.currency,
      local_order_id: publicOrderId,
      source: "tenant",
      collection: collectionName,
    });
  } catch (error) {
    console.error("createOrder error:", error);
    return res.status(500).json({ status: false, message: "Failed to create order" });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ status: false, message: "Missing payment params" });
    }
    const crypto = await import("crypto");
    const generatedSignature = crypto.createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ status: false, message: "Signature mismatch" });
    }

    const tenantUpdate = await markTenantOrderPaymentCaptured({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (tenantUpdate?.order) {
      const tenantOrderId = String(
        tenantUpdate.order?.order_id ?? tenantUpdate.order?.orderId ?? ""
      ).trim();
      return res.status(200).json({
        status: true,
        message: "Payment verified",
        order_id: tenantOrderId || undefined,
        source: "tenant",
      });
    }

    const order = await Orders.findOne({ razorpay_order_id });
    if (order) {
      order.payment_status = "paid";
      order.status = "confirmed";
      order.razorpay_payment_id = razorpay_payment_id;
      order.razorpay_signature = razorpay_signature;
      await order.save();
    }

    return res.status(200).json({ status: true, message: "Payment verified", order_id: order?.order_id });
  } catch (error) {
    console.error("confirmPayment error:", error);
    return res.status(500).json({ status: false, message: "Failed to confirm payment" });
  }
};

export const updateUserAddress = async (req, res) => {
  try {
    const { address_id, id, ...rest } = req.body || {};
    const addrId = Number(address_id ?? id);
    if (!addrId || Number.isNaN(addrId)) {
      return res.status(400).json({ status: false, message: "address_id required" });
    }
    const updated = await Addresses.findOneAndUpdate(
      { address_id: addrId },
      {
        full_name: rest.FullName,
        phone: rest.phone1,
        alt_phone: rest.phone2,
        address_line1: rest.address,
        city: rest.city,
        state: rest.state,
        postal_code: rest.pinCode,
        country: rest.country,
        FullName: rest.FullName,
        phone1: rest.phone1,
        phone2: rest.phone2,
        pinCode: rest.pinCode,
        address: rest.address,
        addressType: rest.addressType,
      },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ status: false, message: "Address not found" });
    }
    const shaped = {
      id: updated.address_id,
      address_id: updated.address_id,
      FullName: updated.FullName,
      phone1: updated.phone1,
      phone2: updated.phone2,
      country: updated.country,
      state: updated.state,
      city: updated.city,
      pinCode: updated.pinCode,
      address: updated.address,
      addressType: updated.addressType,
    };
    return res.status(200).json({ status: true, address: shaped, data: shaped });
  } catch (error) {
    console.error("updateUserAddress error:", error);
    return res.status(500).json({ status: false, message: "Failed to update address" });
  }
};

export const getUserAddresses = async (_req, res) => {
  const addresses = await Addresses.find({}).sort({ createdAt: -1 });
  const mapped = addresses.map((a) => ({
    id: a.address_id || a._id?.toString(),
    address_id: a.address_id,
    FullName: a.FullName || a.full_name || "",
    phone1: a.phone1 || a.phone || "",
    phone2: a.phone2 || a.alt_phone || "",
    country: a.country || "",
    state: a.state || "",
    city: a.city || "",
    pinCode: a.pinCode || a.postal_code || "",
    address: a.address || a.address_line1 || "",
    addressType: a.addressType || "",
  }));
  return res
    .status(200)
    .json({ status: true, addresses: mapped, data: mapped, message: "ok" });
};

export const createNewAddress = async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.address_id) {
      payload.address_id = await getNextSequence("address_id");
    }
    const addr = await Addresses.create({
      address_id: payload.address_id,
      full_name: payload.FullName,
      email: payload.email,
      phone: payload.phone1,
      alt_phone: payload.phone2,
      address_line1: payload.address || "",
      address_line2: payload.address_line2 || "",
      city: payload.city,
      state: payload.state,
      postal_code: payload.pinCode,
      country: payload.country || "India",
      FullName: payload.FullName,
      phone1: payload.phone1,
      phone2: payload.phone2,
      pinCode: payload.pinCode,
      address: payload.address,
      addressType: payload.addressType,
    });
    const shaped = {
      id: addr.address_id,
      address_id: addr.address_id,
      FullName: addr.FullName,
      phone1: addr.phone1,
      phone2: addr.phone2,
      country: addr.country,
      state: addr.state,
      city: addr.city,
      pinCode: addr.pinCode,
      address: addr.address,
      addressType: addr.addressType,
    };
    return res
      .status(201)
      .json({ status: true, address: shaped, data: shaped, message: "Address created" });
  } catch (error) {
    console.error("createNewAddress error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to create address" });
  }
};

// ---- Orders: cancel order ----
export const cancelOrder = async (req, res) => {
  try {
    const { order_id, id } = req.body || {};
    const idStr = order_id || id;
    if (!idStr) {
      return res.status(400).json({ status: false, message: "order_id required" });
    }

    const tenantCancel = await cancelTenantOrderIfExists(idStr);
    if (tenantCancel?.blocked) {
      return res.status(400).json({ status: false, message: tenantCancel.message });
    }
    if (tenantCancel?.order) {
      return res.status(200).json({
        status: true,
        message: "Order cancelled",
        order: normalizeTenantOrderDoc(tenantCancel.order),
        source: "tenant",
      });
    }

    // Match either numeric order_id or Mongo _id
    const query =
      !Number.isNaN(Number(idStr)) && Number.isFinite(Number(idStr))
        ? { order_id: Number(idStr) }
        : { _id: idStr };

    const order = await Orders.findOne(query);
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    const finalStatuses = ["cancelled", "rejected", "delivered", "rto"];
    if (finalStatuses.includes((order.status || "").toLowerCase())) {
      return res
        .status(400)
        .json({ status: false, message: `Order already ${order.status}` });
    }

    order.status = "cancelled";
    order.payment_status = order.payment_status === "paid" ? "refund_pending" : "cancelled";
    await order.save();

    return res.status(200).json({
      status: true,
      message: "Order cancelled",
      order,
    });
  } catch (error) {
    console.error("cancelOrder error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to cancel order" });
  }
};
