import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true, index: true },
    qty: { type: Number, required: true, min: 1, default: 1 },
    price: { type: Number, required: true, min: 0, default: 0 },
    mrp: { type: Number, min: 0, default: 0 },
    title: { type: String, trim: true, default: "" },
    image: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const CartStateSchema = new mongoose.Schema(
  {
    cart_id: { type: String, required: true, unique: true, index: true, trim: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

const CartState = mongoose.model("CartState", CartStateSchema);

export default CartState;
