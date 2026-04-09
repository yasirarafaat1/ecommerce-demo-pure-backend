import { Router } from "express";
import {
  showProducts,
  getProductById,
  getProductByCategory,
  searchProducts,
  getCategories,
  getStoreConfig,
  getProductReviews,
  addProductReview,
  listWishlist,
  addToWishlistDb,
  removeFromWishlistDb,
  clearWishlistDb,
  getUserCart,
  saveUserCart,
  getUserAddresses,
  createNewAddress,
  addToCart,
  removeCartByProduct,
  updateCartItem,
  clearCart,
  updateUserAddress,
  getUserProfile,
  updateUserProfile,
  getUserOrders,
  createOrder,
  confirmPayment,
  cancelOrder,
} from "../controller/user.controller.js";
import { upload } from "../middleware/multer.middleware.js";

const router = Router();

router.get("/show-product", showProducts);
router.get("/get-product-byid/:id", getProductById);
router.get("/get-product-byCategory/:category", getProductByCategory);
router.post("/search", searchProducts);
router.get("/get-categories", getCategories);
router.get("/store-config", getStoreConfig);
router.get("/get-product-reviews/:id", getProductReviews);
router.post("/product-reviews", upload.single("reviewImage"), addProductReview);
router.post("/wishlist/list", listWishlist);
router.post("/wishlist/add", addToWishlistDb);
router.post("/wishlist/remove", removeFromWishlistDb);
router.post("/wishlist/clear", clearWishlistDb);
router.post("/get-user-cart", getUserCart);
router.post("/save-cart", saveUserCart);
router.post("/add-to-cart", addToCart);
router.get("/remove-cart-by-product/:productId", removeCartByProduct);
router.post("/update-cart-item", updateCartItem);
router.post("/clear-cart", clearCart);
router.post("/get-user-addresess", getUserAddresses);
router.post("/create-newAddress", createNewAddress);
router.patch("/update-user-address", updateUserAddress);
router.post("/get-user-profile", getUserProfile);
router.post("/update-user-profile", updateUserProfile);
router.post("/get-orders", getUserOrders);
router.post("/create-order", createOrder);
router.post("/payment-success", confirmPayment);
router.post("/cancel-order", cancelOrder);

export { router };
export default router;
