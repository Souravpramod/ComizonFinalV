
import crypto    from 'crypto';
import Wallet    from '../../models/Wallet.js';
import Order     from '../../models/Order.js';
import Payment   from '../../models/Payment.js';
import Product   from '../../models/Product.js';
import Cart      from '../../models/Cart.js';
import User      from '../../models/Users.js';
import razorpay  from '../../config/razorpay.js';

const SHIPPING_FEE  = 5;
const FREE_SHIPPING = 500;


async function buildOrderItemsFromCart(cartItems) {
    const orderItems = [];
    for (const cartItem of cartItems) {
        const product = await Product.findById(cartItem.productId._id);
        if (!product || !product.isActive) continue;
        if (product.stockQuantity < cartItem.quantity) {
            throw new Error(`Insufficient stock for ${product.productName}`);
        }
        product.stockQuantity -= cartItem.quantity;
        product.outOfstock     = product.stockQuantity === 0;
        await product.save();

        orderItems.push({
            productId:   product._id,
            productName: product.productName,
            sku:         product.sku || '',
            image:       product.images?.[0] || '',
            price:       product.price,
            quantity:    cartItem.quantity,
            lineTotal:   +(product.price * cartItem.quantity).toFixed(2),
            itemStatus:  'pending',
            unitStatuses: Array.from({ length: cartItem.quantity }, (_, i) => ({
                unitIndex: i,
                status: 'pending',
            })),
        });
    }
    return orderItems;
}


export const getWallet = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    try {
        const [wallet, user] = await Promise.all([
            Wallet.findOrCreate(req.session.user.id),
            User.findById(req.session.user.id).lean(),
        ]);


        const transactions = [...wallet.transactions]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 20);

        res.render('user/wallet', {
            title:        'My Wallet',
            wallet,
            transactions,
            user,
            activePage:   'wallet',
            error:        req.query.error   || null,
            success:      req.query.success || null,
        });
    } catch (err) {
        console.error('getWallet error:', err.message);
        res.redirect('/profile?error=Failed+to+load+wallet');
    }
};

export const createTopupOrder = async (req, res) => {
    if (!req.session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const amount = parseFloat(req.body.amount);
    if (!amount || amount < 10 || amount > 50000) {
        return res.status(400).json({ error: 'Amount must be between $10 and $50,000' });
    }

    try {
        const rzpOrder = await razorpay.orders.create({
            amount:   Math.round(amount * 100),   
            currency: 'USD',
            receipt:  `wallet_${Date.now()}`,
        });

        res.json({
            success:         true,
            razorpayOrderId: rzpOrder.id,
            amount:          rzpOrder.amount,
            currency:        rzpOrder.currency,
            key:             process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error('createTopupOrder error:', err.message);
        res.status(500).json({ error: 'Failed to create top-up order' });
    }
};


export const verifyTopup = async (req, res) => {
    if (!req.session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const userId = req.session.user.id;

    try {
        
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        if (hmac.digest('hex') !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        const creditAmount = +(parseFloat(amount) / 100).toFixed(2); 


        const wallet = await Wallet.findOrCreate(userId);
        await wallet.credit(creditAmount, 'topup', `Wallet top-up via Razorpay`);


        const { Types } = await import('mongoose');
        await Payment.create({
            orderId:          new Types.ObjectId(),   
            userId,
            gateway:          'razorpay',
            gatewayOrderId:   razorpay_order_id,
            gatewayPaymentId: razorpay_payment_id,
            gatewaySignature: razorpay_signature,
            amount:           Math.round(creditAmount * 100),
            status:           'captured',
            method:           'other',
        });

        res.json({ success: true, newBalance: wallet.balance });
    } catch (err) {
        console.error('verifyTopup error:', err.message);
        res.status(500).json({ success: false, message: 'Top-up verification failed' });
    }
};


export const placeOrderWithWallet = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const userId = req.session.user.id;

    try {
        const [cartDoc, user] = await Promise.all([
            Cart.findOne({ userId })
                .populate({
                    path:   'items.productId',
                    select: 'productName images price stockQuantity outOfstock isActive sku',
                })
                .lean(),
            User.findById(userId).lean(),
        ]);

        if (!cartDoc || cartDoc.items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty' });
        }

        const validItems = cartDoc.items.filter(i => i.productId?.isActive);
        if (validItems.length === 0) {
            return res.json({ success: false, message: 'No valid items in cart' });
        }


        const addressId = req.body.addressId;
        let shippingAddress = {};
        if (addressId && user.addresses?.length) {
            const addr = user.addresses.find(a => a._id.toString() === addressId);
            if (addr) {
                shippingAddress = {
                    addressLane1: addr.addressLane1,
                    addressLane2: addr.addressLane2 || '',
                    city:    addr.city,
                    state:   addr.state  || '',
                    pincode: addr.pincode,
                    country: addr.country || '',
                };
            }
        }


        const orderItems = await buildOrderItemsFromCart(validItems);
        if (orderItems.length === 0) {
            return res.json({ success: false, message: 'All items are out of stock' });
        }

        const subtotal    = +orderItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
        const shippingFee = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        const total       = +(subtotal + shippingFee).toFixed(2);


        const wallet = await Wallet.findOrCreate(userId);
        if (wallet.balance < total) {
         
            for (const item of orderItems) {
                await Product.findByIdAndUpdate(item.productId, {
                    $inc: { stockQuantity: item.quantity },
                    outOfstock: false,
                });
            }
            return res.json({
                success: false,
                message: `Insufficient wallet balance. Your balance is $${wallet.balance.toFixed(2)}, but the order total is $${total.toFixed(2)}.`,
            });
        }

 
        const order = await Order.create({
            userId,
            items:         orderItems,
            status:        'pending',
            subtotal,
            shippingFee,
            total,
            shippingAddress,
            paymentMethod: 'wallet',
            paymentStatus: 'paid',
        });

        await wallet.debit(
            total,
            'order_payment',
            `Payment for order ${order.orderId}`,
            { orderId: order._id }
        );

  
        const { Types } = await import('mongoose');
        
        await Payment.create({
            orderId:          order._id, 
            userId:           userId,
            gateway:          'wallet',  
            gatewayOrderId:   `WAL-${Date.now()}`, 
            amount:           Math.round(total * 100),  
            status:           'captured',
            method:           'wallet', 
        });

        
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

        res.json({ success: true, redirectUrl: `/orders/${order._id}/success` });

    } catch (err) {
        console.error('placeOrderWithWallet error:', err.message);
        res.json({ success: false, message: err.message || 'Failed to place order via wallet' });
    }
};


/**
 * Credit refund amount back to user's wallet.
 * @param {string} userId
 * @param {number} amount   
 * @param {ObjectId} orderId
 * @param {string} description
 */
export const refundToWallet = async (userId, amount, orderId, description = 'Order refund') => {
    const wallet = await Wallet.findOrCreate(userId);
    await wallet.credit(amount, 'order_refund', description, { orderId });
};
