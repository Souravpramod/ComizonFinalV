
import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
 
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: false, 
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true,
    },


    gateway: {
        type: String,
        enum: ['razorpay', 'cod', 'wallet'],
        required: true,
    },


    gatewayOrderId:   { type: String, default: '' },   
    gatewayPaymentId: { type: String, default: '' },   
    gatewaySignature: { type: String, default: '' },   

   
    amount:   { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    
    method: {
        type: String,
        enum: ['card', 'upi', 'netbanking', 'wallet', 'cod', 'other'],
        default: 'other',
    },

   
    cardLast4:    { type: String, default: '' },
    cardNetwork:  { type: String, default: '' },
    cardHolderName: { type: String, default: '' },

    
    upiId: { type: String, default: '' },

    
    status: {
        type: String,
        enum: ['created', 'attempted', 'captured', 'failed', 'refunded'],
        default: 'created',
    },

    
    failureReason:  { type: String, default: '' },
    failureCode:    { type: String, default: '' },

    
    refundId:     { type: String, default: '' },
    refundedAt:   { type: Date, default: null },
    refundAmount: { type: Number, default: 0 },
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;