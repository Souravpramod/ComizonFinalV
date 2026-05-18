// ============================================================
// REPLACEMENT FILE — models/Order.js
// Replace your entire existing models/Order.js with this
// ============================================================

import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
    productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName:  { type: String, required: true },
    sku:          { type: String, default: '' },
    image:        { type: String, default: '' },
    price:        { type: Number, required: true },
    quantity:     { type: Number, required: true, min: 1 },
    lineTotal:    { type: Number, required: true },
   

    // Per-ITEM status (user-facing: cancel/return per product)
    itemStatus: {
        type: String,
        enum: ['pending','processing','shipped','out_for_delivery','delivered','cancelled','return_requested','returned'],
        default: 'pending',
    },
    cancelReason: { type: String, default: '' },
    returnReason: { type: String, default: '' },
    returnDeniedReason: { type: String, default: '' },
    attention:{type:Number,default:0},
    flaggedresponse:{type:Number,default:0},
    // Per-UNIT statuses (admin-facing: each physical copy tracked individually)
    unitStatuses: [
        {
            unitIndex: { type: Number },
            status: {
                type: String,
                enum: ['pending','processing','shipped','out_for_delivery','delivered','cancelled','return_requested','returned'],
                default: 'pending',
            },
            
        }
    ],
});

const orderSchema = new mongoose.Schema({
    orderId:  { type: String, unique: true },   // e.g. ORD-1720000000000
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },

    items: [orderItemSchema],

    // Overall order status — derived from item statuses
    status: {
        type: String,
        enum: ['pending','processing','shipped','out_for_delivery','delivered','cancelled','return_requested','returned','failed'],
        default: 'pending',
    },
    attention:{type:Number,default:0},
    subtotal:    { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    total:       { type: Number, required: true },
     discount:    { type: Number, default: 0 },
    shippingAddress: {
        addressLane1: String,
        addressLane2: String,
        city:         String,
        state:        String,
        pincode:      String,
        country:      String,
    },

    paymentMethod: { type: String, default: 'cod' },
    paymentStatus: { type: String, enum: ['pending','paid','refunded','failed'], default: 'pending' },
    couponId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },

    notes:     { type: String, default: '' },
    orderedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: null },  
    returnWindowDays: { type: Number, default: 7 },
}, { timestamps: true });



// Auto-generate readable orderId before first save
orderSchema.pre('save', async function (next) {
    if (!this.orderId) {
        this.orderId = `ORD-${Date.now()}`;
    }
    if (this.paymentMethod === 'online' && this.paymentStatus === 'pending') {
        this.status = 'failed';
    }
    
});



const Order = mongoose.model('Order', orderSchema);
export default Order;
