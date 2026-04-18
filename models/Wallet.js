// ============================================================
// models/Wallet.js
// ============================================================
import mongoose from 'mongoose';

// Each credit / debit line in the ledger
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
    // What triggered this entry
    reason: {
        type: String,
        enum: [
            'topup',           // user added money via Razorpay
            'order_payment',   // wallet used to pay for an order
            'order_refund',    // refund after cancellation / return
            'admin_credit',    // manual credit by admin
        ],
        required: true,
    },
    // Optional reference to the linked order or payment
    orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order',   default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },

    // Human-readable note shown in transaction history
    description: { type: String, default: '' },

    // Balance AFTER this transaction (snapshot — useful for statements)
    balanceAfter: { type: Number, default: 0 },
}, { timestamps: true });

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true,
        unique: true,   // one wallet per user
    },
    balance: {
        type: Number,
        default: 0,
        min: 0,
    },
    transactions: [transactionSchema],
}, { timestamps: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Credit the wallet and append a ledger entry.
 * Returns the updated wallet.
 */
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

/**
 * Debit the wallet.
 * Throws if balance is insufficient.
 */
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

/**
 * Find-or-create wallet for a user.
 */
walletSchema.statics.findOrCreate = async function (userId) {
    let wallet = await this.findOne({ userId });
    if (!wallet) wallet = await this.create({ userId, balance: 0, transactions: [] });
    return wallet;
};

const Wallet = mongoose.model('Wallet', walletSchema);
export default Wallet;
