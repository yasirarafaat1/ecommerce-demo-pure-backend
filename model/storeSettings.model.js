import mongoose from "mongoose";

const StoreSettingsSchema = new mongoose.Schema(
    {
        storeId: { type: String, required: true, trim: true },
        storeName: { type: String, default: "", trim: true },
        navbarTitle: { type: String, default: "", trim: true },
        footerTitle: { type: String, default: "", trim: true },
        footerDescription: { type: String, default: "", trim: true },
        address: { type: String, default: "", trim: true },
        email: { type: String, default: "", trim: true },
        phone: { type: String, default: "", trim: true },
        currencySymbol: { type: String, default: "₹", trim: true },
        companyAddress: { type: String, default: "", trim: true },
        companyEmail: { type: String, default: "", trim: true },
        instagramUrl: { type: String, default: "", trim: true },
        facebookUrl: { type: String, default: "", trim: true },
        twitterUrl: { type: String, default: "", trim: true },
        youtubeUrl: { type: String, default: "", trim: true },
        linkedinUrl: { type: String, default: "", trim: true },
    },
    {
        timestamps: true,
        strict: false,
        collection: "storesettings",
    }
);

StoreSettingsSchema.index({ storeId: 1 }, { unique: true });

const StoreSettings =
    mongoose.models.StoreSettings || mongoose.model("StoreSettings", StoreSettingsSchema);

export default StoreSettings;
