
import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({

    code: {
        type:     String,
        required: true,
        unique:   true,
        uppercase: true,
        trim:     true,
    },

    description: { type: String, default: '' },


    discountType: {
        type:     String,
        enum:     ['flat', 'percent'],
        required: true,
    },

    discountValue: { type: Number, required: true },  
    maxDiscount:   { type: Number, default: null },     

    
    minOrderAmount: { type: Number, default: 0 },       


    eligibility: {
        type:    String,
        enum:    ['all', 'new_user', 'loyal', 'bank','referred'],
        default: 'all',
    },

    loyaltyThreshold: { type: Number, default: 5 },    


    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },


    applyScope: { type: String, enum: ['cart', 'product'], default: 'cart' },


    minProductQty: { type: Number, default: 0 },

    usageLimitTotal: { type: Number, default: null },   
    usageLimitPerUser: { type: Number, default: 1 },    
    usedCount:       { type: Number, default: 0 },

    
    usedBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
        count:  { type: Number, default: 1 },
    }],


    isActive:  { type: Boolean, default: true },
    expiresAt: { type: Date,    default: null }, 
    allowDoubleDiscount: { type: Boolean, default: false },  

}, { timestamps: true });


couponSchema.methods.computeDiscount = function (baseAmount) {
    if (!this.isActive)
        throw new Error('This coupon is no longer active.');

    if (this.expiresAt && new Date() > this.expiresAt)
        throw new Error('This coupon has expired.');

    if (this.usageLimitTotal !== null && this.usedCount >= this.usageLimitTotal)
        throw new Error('This coupon has reached its usage limit.');

    let discount = 0;
    if (this.discountType === 'flat') {
        discount = this.discountValue;
    } else {
        discount = +(baseAmount * this.discountValue / 100).toFixed(2);
        if (this.maxDiscount) discount = Math.min(discount, this.maxDiscount);
    }


    return Math.min(discount, baseAmount);
};

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
