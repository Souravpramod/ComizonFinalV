
import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({
    title:       { type: String, required: true, trim: true },

   
    badgeColorListing: { type: String, default: '#E63946' }, 
    badgeColorDetail:  { type: String, default: '#E63946' }, 

    offerType: {
        type:     String,
        enum:     ['product', 'category', 'referral'],
        required: true,
    },

    productIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    discountType: {
        type: String,
        enum: ['flat', 'percent'],
        required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount:   { type: Number, default: null },

    referralReward: { type: Number, default: 0 }, // wallet credit for referrer

    isActive:  { type: Boolean, default: true },
    startsAt:  { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    usedCount: { type: Number, default: 0 },
}, { timestamps: true });

offerSchema.methods.computeDiscount = function (price) {
    const now = new Date();
    if (!this.isActive) return 0;
    if (this.startsAt  && now < this.startsAt)  return 0;
    if (this.expiresAt && now > this.expiresAt) return 0;

    let discount = 0;
    if (this.discountType === 'flat') {
        discount = Math.min(this.discountValue, price);
    } else {
        discount = +(price * this.discountValue / 100).toFixed(2);
        if (this.maxDiscount) discount = Math.min(discount, this.maxDiscount);
        discount = Math.min(discount, price);
    }
    return +discount.toFixed(2);
};

offerSchema.methods.isCurrentlyActive = function () {
    const now = new Date();
    if (!this.isActive) return false;
    if (this.startsAt  && now < this.startsAt)  return false;
    if (this.expiresAt && now > this.expiresAt) return false;
    return true;
};

const Offer = mongoose.model('Offer', offerSchema);
export default Offer;