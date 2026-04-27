
import mongoose from 'mongoose';


const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },

    reason: {
        type: String,
        enum: [
            'topup',           
            'order_payment',   
            'order_refund',    
            'admin_credit',    
            'referral_reward',
            'payment_failed',
        ],
        required: true,
    },
    
    orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order',   default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },

    
    description: { type: String, default: '' },

    
    balanceAfter: { type: Number, default: 0 },
}, { timestamps: true });

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true,
        unique: true,   
    },
    balance: {
        type: Number,
        default: 0,
        min: 0,
    },
    transactions: [transactionSchema],
}, { timestamps: true });


walletSchema.methods.credit = async function (amount, reason, description = '', meta = {}) {
    this.balance = +(this.balance + amount).toFixed(2);
    this.transactions.push({
        type: 'credit',
        amount,
        reason,
        description,
        balanceAfter: this.balance,
        orderId:   meta.orderId   || null,
        paymentId: meta.paymentId || null,
    });
    return this.save();
};


walletSchema.methods.debit = async function (amount, reason, description = '', meta = {}) {
    if (this.balance < amount) {
        throw new Error('Insufficient wallet balance');
    }
    this.balance = +(this.balance - amount).toFixed(2);
    this.transactions.push({
        type: 'debit',
        amount,
        reason,
        description,
        balanceAfter: this.balance,
        orderId:   meta.orderId   || null,
        paymentId: meta.paymentId || null,
    });
    return this.save();
};


walletSchema.statics.findOrCreate = async function (userId) {
    let wallet = await this.findOne({ userId });
    if (!wallet) wallet = await this.create({ userId, balance: 0, transactions: [] });
    return wallet;
};

const Wallet = mongoose.model('Wallet', walletSchema);
export default Wallet;
