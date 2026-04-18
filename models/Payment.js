// ============================================================
// UPDATED FILE — models/Payment.js
// ============================================================
import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    // 1. MODIFIED: Removed required: true because order is created AFTER payment
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: false, // Changed from true to allow null during initialization
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true,
    },

    // Gateway details
    gateway: {
        type: String,
        enum: ['razorpay', 'cod', 'wallet'],
        required: true,
    },

    // IDs from the gateway
    gatewayOrderId:   { type: String, default: '' },   // Razorpay order_id
    gatewayPaymentId: { type: String, default: '' },   // Razorpay payment_id
    gatewaySignature: { type: String, default: '' },   // Razorpay signature

    // Amount in smallest currency unit (paise for INR, cents for USD)
    amount:   { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    // Payment method used at gateway level
    method: {
        type: String,
        enum: ['card', 'upi', 'netbanking', 'wallet', 'cod', 'other'],
        default: 'other',
    },

    // Card-specific
    cardLast4:    { type: String, default: '' },
    cardNetwork:  { type: String, default: '' },
    cardHolderName: { type: String, default: '' },

    // UPI
    upiId: { type: String, default: '' },

    // Status lifecycle
    status: {
        type: String,
        enum: ['created', 'attempted', 'captured', 'failed', 'refunded'],
        default: 'created',
    },

    // Failure info
    failureReason:  { type: String, default: '' },
    failureCode:    { type: String, default: '' },

    // Refund info
    refundId:     { type: String, default: '' },
    refundedAt:   { type: Date, default: null },
    refundAmount: { type: Number, default: 0 },
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;