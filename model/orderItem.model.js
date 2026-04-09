import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    title: { type: String, default: "" },
    image: { type: String, default: "" },
    color: { type: String, default: "" },
    size: { type: String, default: "" },
  },
  { _id: false }
);

export default OrderItemSchema;
