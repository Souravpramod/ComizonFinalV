import mongoose from 'mongoose';
import crypto  from 'crypto';
import Order   from '../../models/Order.js';
import Product from '../../models/Product.js';
import User    from '../../models/Users.js';
import Payment   from '../../models/Payment.js';
import razorpay  from '../../config/razorpay.js';
import Cart from '../../models/Cart.js';
import Coupon   from '../../models/Coupon.js';
import Wallet    from '../../models/Wallet.js';
import { getEligibleCoupons, recordCouponUsage ,refundCouponUsage} from './couponController.js';
import { placeOrderWithWallet, refundToWallet } from './walletController.js';
import { getBestOfferForProduct } from '../admin/offerController.js';
const GEOAPIFY_KEY = 'b09bff8571104f748963424f37336206';

const SHIPPING_FEE  = 5;
const FREE_SHIPPING = 500;

export const getCheckout = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

  
    if (req.query.retryOrderId) {
        try {
            const retryOrder = await Order.findOne({
                _id:           req.query.retryOrderId,
                userId:        req.session.user.id,
                paymentMethod: 'online',
                paymentStatus: { $in: ['pending', 'failed'] },
            }).lean();

            if (retryOrder) {
                
                const productIds = retryOrder.items.map(i => i.productId);
                const liveProducts = await Product.find(
                    { _id: { $in: productIds } },
                    'stockQuantity outOfstock isActive'
                ).lean();

                const stockMap = {};
                liveProducts.forEach(p => { stockMap[p._id.toString()] = p; });

                const qtyAdjusted = [];   
                const cartItems   = [];

                for (const oi of retryOrder.items) {
                    const pid   = oi.productId.toString();
                    const live  = stockMap[pid];

                    
                    if (!live || !live.isActive || live.outOfstock || live.stockQuantity < 1) continue;

                    const MAX_QTY  = 6;
                    const safeQty  = Math.min(oi.quantity, live.stockQuantity, MAX_QTY);

                    if (safeQty < oi.quantity) {
                        qtyAdjusted.push({ name: oi.productName, from: oi.quantity, to: safeQty });
                    }

                    cartItems.push({ productId: oi.productId, quantity: safeQty });
                }

                
                await Cart.findOneAndUpdate(
                    { userId: req.session.user.id },
                    { $set: { items: cartItems } },
                    { upsert: true }
                );

                
                req.session.pendingOrderData = {
                    retryOrderId:    retryOrder._id.toString(),
                    orderId:         retryOrder._id.toString(),
                    isRetry:         true,
                    orderItems:      retryOrder.items,
                    subtotal:        retryOrder.subtotal,
                    shippingFee:     retryOrder.shippingFee,
                    discount:        retryOrder.discount || 0,
                    total:           retryOrder.total,
                    shippingAddress: retryOrder.shippingAddress,
                    couponId:        retryOrder.couponId ? retryOrder.couponId.toString() : null,
                 
                    qtyAdjusted:     qtyAdjusted.length ? qtyAdjusted : null,
                };
            }
        } catch (retryErr) {
            console.error('retryOrderId restore error:', retryErr.message);
          
        }
    }

    try {
        const [cartDoc, user] = await Promise.all([
            Cart.findOne({ userId: req.session.user.id })
                .populate({
                    path:   'items.productId',
                    select: 'productName images price categoryId stockQuantity outOfstock isActive isPremium',
                })
                .lean(),
            User.findById(req.session.user.id).lean(),
        ]);

        const hasBlocked = (cartDoc?.items || []).some(
            i => i.productId && !i.productId.isActive
        );
        if (hasBlocked) {
            return res.redirect('/cart?error=Remove+blocked+items+before+proceeding+to+checkout');
        }

        
        const hasPremiumLocked = (cartDoc?.items || []).some(
            i => i.productId?.isPremium && !user?.isPremium
        );
        if (hasPremiumLocked) {
            return res.redirect('/cart?error=Your+cart+contains+a+premium+product.+Upgrade+your+membership+or+remove+it+to+proceed.');
        }
        

        const rawItems = (cartDoc?.items || [])
            .filter(i => i.productId && i.productId.isActive && !i.productId.outOfstock);

        const cartItems = await Promise.all(rawItems.map(async (i) => {
            const prod = i.productId;
            const offerResult = await getBestOfferForProduct(
                prod._id,
                prod.categoryId || prod.category || null,
                prod.price
            );
            const effectivePrice = offerResult ? offerResult.effectivePrice : prod.price;
            return {
                _id:            prod._id.toString(),
                name:           prod.productName,
                image:          prod.images?.[0] || '',
                price:          prod.price,
                effectivePrice,
                hasOffer:       !!offerResult,
                offerBadge:     offerResult
                                  ? (offerResult.discountType === 'flat'
                                      ? `₹${offerResult.discountValue} OFF`
                                      : `${offerResult.discountValue}% OFF`)
                                  : null,
                quantity:       i.quantity,
                stock:          prod.stockQuantity,
                lineTotal:      +(effectivePrice * i.quantity).toFixed(2),
                categoryId:     prod.categoryId ? prod.categoryId.toString()
                              : prod.category   ? prod.category.toString()
                              : null,
            };
        }));

        if (cartItems.length === 0) return res.redirect('/cart?error=Your+cart+is+empty');

        const subtotal    = +cartItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
        const shippingFee = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        const total       = +(subtotal + shippingFee).toFixed(2);
        const defaultAddress = user.addresses?.find(a => a.isDefault) || user.addresses?.[0] || null;
        

        const availableCoupons = await getEligibleCoupons(req.session.user.id, subtotal);
        const walletDoc = await Wallet.findOne({ userId: req.session.user.id }).lean();
        const walletBalance = walletDoc ? walletDoc.balance : 0;
 
        
        const qtyAdjusted = req.session.pendingOrderData?.qtyAdjusted || null;
        if (req.session.pendingOrderData?.qtyAdjusted) {
            delete req.session.pendingOrderData.qtyAdjusted;
        }

        res.render('user/checkout', {
            title:       'Checkout',
            cartItems,
            subtotal,
            shippingFee,
            total,
            user,
            addresses:        user.addresses || [],
            defaultAddress,
            availableCoupons,
            walletBalance,
            qtyAdjusted,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });
 
    } catch (err) {
        console.error('getCheckout error:', err.message);
        res.redirect('/cart?error=Failed+to+load+checkout');
    }
};



export const placeOrder = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const userId = req.session.user.id;

    try {
    
        const [cartDoc, user] = await Promise.all([
            Cart.findOne({ userId })
                .populate({
                    path: 'items.productId',
                    select: 'productName images price stockQuantity outOfstock isActive isPremium sku'
                })
                .lean(),
            User.findById(userId).lean(),
        ]);

        if (!cartDoc || cartDoc.items.length === 0) {
            return res.redirect('/cart?error=Your+cart+is+empty');
        }

        const validItems = cartDoc.items.filter(i => i.productId?.isActive);
        if (validItems.length === 0) {
            return res.redirect('/cart?error=No+valid+items+in+cart');
        }

      
        const premiumBlocked = validItems.some(
            i => i.productId?.isPremium && !user?.isPremium
        );
        if (premiumBlocked) {
          
            return res.json({
                success: false,
                message: 'Your cart contains a Premium product. Remove it or upgrade your membership to place the order.',
            });
        }
        

        let shippingAddress = {};
        const addressId = req.body.addressId;

        if (addressId && user.addresses?.length) {
            const addr = user.addresses.find(a => a._id.toString() === addressId);
            if (addr) {
                shippingAddress = {
                    addressLane1: addr.addressLane1,
                    addressLane2: addr.addressLane2 || '',
                    city: addr.city,
                    state: addr.state || '',
                    pincode: addr.pincode,
                    country: addr.country || '',
                };
            }
        }

        const orderItems = [];

     
        for (const cartItem of validItems) {
            const product = await Product.findById(cartItem.productId._id);

            if (!product || !product.isActive) continue;

           
            if (product.stockQuantity < cartItem.quantity) {
                return res.redirect(`/cart?error=Insufficient+stock+for+${encodeURIComponent(product.productName)}`);
            }

            const offerResult    = await getBestOfferForProduct(
                product._id,
                product.categoryId,
                product.price
            );
            const effectivePrice = offerResult ? offerResult.effectivePrice : product.price;

            orderItems.push({
                productId:   product._id,
                productName: product.productName,
                sku:         product.sku || '',
                image:       product.images?.[0] || '',
                price:       product.price,
                effectivePrice,
                quantity:    cartItem.quantity,
                lineTotal:   +(effectivePrice * cartItem.quantity).toFixed(2),
                itemStatus:  'pending',
                unitStatuses: Array.from({ length: cartItem.quantity }, (_, i) => ({
                    unitIndex: i,
                    status: 'pending'
                })),
            });
        }


        const subtotal = +orderItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
        const shippingFee = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        const total = +(subtotal + shippingFee).toFixed(2);


        let paymentMethod = req.body.paymentMethod;
        if (Array.isArray(paymentMethod)) {
            paymentMethod = paymentMethod[0];
        }
        paymentMethod = paymentMethod || 'cod';

        

        if (paymentMethod === 'wallet') {
            return placeOrderWithWallet(req, res);
        }


        if (paymentMethod !== 'cod') {

            let discount   = 0;
            let couponCode = (req.body.couponCode || '').trim().toUpperCase();
            let couponId   = null;

            if (couponCode) {
                const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
                if (coupon) {
                    try {
                        discount = coupon.computeDiscount(subtotal);
                        couponId = coupon._id;
                    } catch (_) { /* invalid coupon — ignore, charge full */ }
                }
            }

            const discountedTotal = +Math.max(0, total - discount).toFixed(2);

            
            const draftOrder = await Order.create({
                userId,
                items:           orderItems,
                subtotal,
                shippingFee,
                discount:        discount || 0,
                total:           discountedTotal,
                shippingAddress,
                paymentMethod:   'online',
                paymentStatus:   'pending',
                status:          'pending',
                couponId:        couponId || null,
            });

            req.session.pendingOrderData = {
                retryOrderId: draftOrder._id.toString(),
                orderId:      draftOrder._id.toString(),  
                orderItems,
                subtotal,
                shippingFee,
                discount,
                total: discountedTotal,
                shippingAddress,
                couponId: couponId ? couponId.toString() : null,
                couponCode: couponCode || null,
            };

            const rzpOrder = await razorpay.orders.create({
                amount:   Math.round(discountedTotal * 100),
                currency: 'USD',
                receipt:  `rcpt_${Date.now()}`,
            });

            return res.json({
                pendingOrder:    true,
                razorpayOrderId: rzpOrder.id,
                amount:          rzpOrder.amount,
                currency:        rzpOrder.currency,
                key:             process.env.RAZORPAY_KEY_ID,
                draftOrderId:    draftOrder._id,
            });
        }

       

        if (req.body.usePendingSession === 'true' && req.session.pendingOrderData) {
            const pending = req.session.pendingOrderData;
            const order = await Order.create({
                userId,
                items:           pending.orderItems,
                status:          'pending',
                subtotal:        pending.subtotal,
                shippingFee:     pending.shippingFee,
                total:           pending.total,
                shippingAddress: pending.shippingAddress,
                paymentMethod:   'cod',
                paymentStatus:   'pending',
            });
            await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
            delete req.session.pendingOrderData;
            return res.json({ success: true, redirectUrl: `/orders/${order._id}/success` });
        }


        let codDiscount   = 0;
        let codCouponId   = null;
        const codCouponCode = (req.body.couponCode || '').trim().toUpperCase();

        if (codCouponCode) {
                const coupon = await Coupon.findOne({ code: codCouponCode, isActive: true });
                if (coupon && typeof coupon.computeDiscount === 'function') {
                    try {
                   
                        codDiscount = coupon.computeDiscount(subtotal);
                        codCouponId = coupon._id;
                    } catch (e) {
                        console.warn('COD Coupon Rejection:', e.message);
                        codDiscount = 0; 
                    }
                }
            }


            const codTotal = +Math.max(0, (subtotal + (shippingFee || 0)) - (codDiscount || 0)).toFixed(2);

        const order = await Order.create({
            userId,
            items: orderItems,
            status: 'pending',
            subtotal,
            shippingFee,
            discount:      codDiscount,
            total:         codTotal,
            shippingAddress,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
        });

        if (codCouponId) await recordCouponUsage(codCouponId, userId);

        
        for (const oi of orderItems) {
            const p = await Product.findById(oi.productId);
            if (p) { p.stockQuantity = Math.max(0, p.stockQuantity - oi.quantity); p.outOfstock = p.stockQuantity === 0; await p.save(); }
        }

        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

        return res.json({ success: true, redirectUrl: `/orders/${order._id}/success` });

    } catch (err) {
        console.error('placeOrder error:', err.message);
        return res.json({ success: false, message: 'Failed to place order. Please try again.' });
    }
};


export const getOrderSuccess = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');
    try {
        const order = await Order.findById(req.params.id)
            .populate('items.productId', 'productName images')
            .lean();

        if (!order || order.userId.toString() !== req.session.user.id)
            return res.redirect('/orders');

        res.render('user/order-success', { title: 'Order Placed!', order });
    } catch (err) {
        console.error('getOrderSuccess error:', err.message);
        res.redirect('/orders');
    }
};

export const getPaymentFailed = async (req, res) => {
    const orderId = req.params.id;
    const reason  = req.query.reason || 'Payment could not be completed.';
    res.render('user/payment-failed', { title: 'Payment Failed', orderId, reason });
};



export const getOrders = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const { search = '', page = 1, filter = '' } = req.query;
    const currentPage = Number(page);
    const LIMIT = 8;

    try {
        const user = await User.findById(req.session.user.id).lean();
        const query = { userId: req.session.user.id };

        if (search) {
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { orderId: { $regex: safe, $options: 'i' } },
                { 'items.productName': { $regex: safe, $options: 'i' } },
            ];
        }

        if (filter === 'delivered') {
            query.status = { $in: ['delivered', 'return_requested', 'returned'] };
        } else if (filter === 'ordered') {
            query.status = { $in: ['pending', 'processing', 'shipped', 'out_for_delivery', 'cancelled'] };
        }

        const totalOrders = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ orderedAt: -1 })
            .skip((currentPage - 1) * LIMIT)
            .limit(LIMIT)
            .lean();

        res.render('user/orders/index', {
            title:      'My Orders',
            orders,
            user,
            totalOrders,
            totalPages:  Math.ceil(totalOrders / LIMIT),
            currentPage,
            search,
            filter,
            activePage: 'orders',
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getOrders error:', err.message);
        res.render('user/orders/index', {
            title: 'My Orders', orders: [], user: {}, totalOrders: 0,
            totalPages: 1, currentPage: 1, search: '', filter: '',
            activePage: 'orders', error: 'Failed to load orders', success: null,
        });
    }


    
};



export const getOrderDetail = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');
    try {
        const user  = await User.findById(req.session.user.id).lean();
        const order = await Order.findById(req.params.id).lean();

        if (!order || order.userId.toString() !== req.session.user.id)
            return res.redirect('/orders?error=Order+not+found');

        res.render('user/orders/detail', {
            title:      `Order #${order.orderId}`,
            order,
            user,
            activePage: 'orders',
            error:   req.query.error   || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error('getOrderDetail error:', err.message);
        res.redirect('/orders?error=Failed+to+load+order');
    }
};



export const cancelItem = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const { orderId, itemId } = req.params;
    const reason = req.body.reason || '';

    try {
        const order = await Order.findById(orderId).populate('items.productId');

        if (!order || order.userId.toString() !== req.session.user.id)
            return res.redirect('/orders?error=Order+not+found');

        const item = order.items.id(itemId);
        if (!item) return res.redirect(`/orders/${orderId}?error=Item+not+found`);

        const cancellableStatuses = ['pending', 'processing'];
        if (!cancellableStatuses.includes(item.itemStatus))
            return res.redirect(`/orders/${orderId}?error=Item+cannot+be+cancelled+at+this+stage`);


        const paidMethods = ['online', 'wallet'];
        const stockWasDeducted = order.paymentStatus !== 'failed';

        if (stockWasDeducted) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stockQuantity: item.quantity },
                outOfstock: false,
            });
        }

      
        const refundAmount     = +item.lineTotal.toFixed(2);
        const originalShipping = order.shippingFee;

    
        const otherItems        = order.items.filter(i => i._id.toString() !== itemId);
        const othersAllTerminal = otherItems.every(i =>
            ['cancelled', 'returned'].includes(i.itemStatus)
        );
        const shippingRefund = othersAllTerminal ? originalShipping : 0;
        const totalRefund    = +(refundAmount + shippingRefund).toFixed(2);

        item.itemStatus   = 'cancelled';
        item.cancelReason = reason;
        item.attention    = 1;
        item.unitStatuses.forEach(u => { u.status = 'cancelled'; });

   
        const remainingStatuses = order.items.map(i => i.itemStatus);
        const allTerminal  = remainingStatuses.every(s => ['cancelled', 'returned'].includes(s));
        const allCancelled = remainingStatuses.every(s => s === 'cancelled');
        if (allTerminal) {
            order.status        = allCancelled ? 'cancelled' : 'returned';
            order.paymentStatus = paidMethods.includes(order.paymentMethod) ? 'refunded' : order.paymentStatus;
        }

        const activeQty   = item.unitStatuses.filter(u => u.status !== 'cancelled').length;
        item.lineTotal    = +(item.price * activeQty).toFixed(2);  


        const terminalStatuses = ['cancelled', 'returned'];
        const activeItems = order.items.filter(i => !terminalStatuses.includes(i.itemStatus));
        const newSubtotal = +activeItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);

       
        const newShipping   = activeItems.length === 0 ? 0
                            : newSubtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        order.subtotal      = newSubtotal;
        order.shippingFee   = newShipping;
        order.total         = +(newSubtotal + newShipping).toFixed(2);

        const allStatuses = order.items.map(i => i.itemStatus);
        if (allStatuses.every(s => s === 'cancelled')) {
            order.status = 'cancelled';
            order.paymentStatus = 'refunded';

            order.items.forEach(i => { i.attention = 1; });
        } else {
            const activeItems = order.items.filter(i => i.itemStatus !== 'cancelled');
            const hasDelivered = activeItems.some(i => i.itemStatus === 'delivered');
            order.status = hasDelivered ? 'delivered' : activeItems[0]?.itemStatus || 'processing';
        }

        
        await order.save();

        if (totalRefund > 0 && paidMethods.includes(order.paymentMethod)) {
            await refundToWallet(
                order.userId.toString(),
                totalRefund,
                order._id,
                shippingRefund > 0
                    ? `Refund for cancelled item "${item.productName}" + shipping fee in order ${order.orderId}`
                    : `Refund for cancelled item "${item.productName}" in order ${order.orderId}`
            );
        }

        if (allCancelled && order.couponId) {
            await refundCouponUsage(order.couponId, order.userId);
        }

        const successMsg = paidMethods.includes(order.paymentMethod) && totalRefund > 0
            ? `Item+cancelled.+₹${totalRefund.toFixed(2)}+refunded+to+your+wallet.`
            : `Item+cancelled+successfully`;
        return res.redirect(`/orders/${orderId}?success=${successMsg}`);

    } catch (err) {
        console.error('cancelItem error:', err.message);
        return res.redirect(`/orders/${orderId}?error=Failed+to+cancel+item`);
    }
};


export const cancelOrder = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const { orderId } = req.params;
    const reason = req.body.reason || '';

    try {
        const order = await Order.findById(orderId).populate('items.productId');

        if (!order || order.userId.toString() !== req.session.user.id)
            return res.redirect('/orders?error=Order+not+found');

        const NON_CANCELLABLE = ['delivered','shipped','out_for_delivery','cancelled','return_requested','returned'];
        if (NON_CANCELLABLE.includes(order.status) || !['pending','processing'].includes(order.status))
            return res.redirect(`/orders/${orderId}?error=Order+cannot+be+cancelled+at+this+stage`);



        const stockWasDeducted = order.paymentStatus !== 'failed';

        for (const item of order.items) {
            if (item.itemStatus !== 'cancelled') {
                if (stockWasDeducted) {
                    await Product.findByIdAndUpdate(item.productId, {
                        $inc: { stockQuantity: item.quantity },
                        outOfstock: false,
                    });
                }
                item.itemStatus   = 'cancelled';
                item.cancelReason = reason;
                item.unitStatuses.forEach(u => { u.status = 'cancelled'; });
            }
        }

        order.status        = 'cancelled';
        order.paymentStatus = 'refunded';
        order.items.forEach(i => { i.attention = 1; });


        const paidMethods    = ['online', 'wallet'];
        const itemsRefund    = +order.items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
        const shippingRefund = order.shippingFee || 0;
        const refundAmount   = +(itemsRefund + shippingRefund).toFixed(2);

        order.subtotal    = 0;
        order.shippingFee = 0;
        order.total       = 0;

        await order.save();

        if (refundAmount > 0 && stockWasDeducted && paidMethods.includes(order.paymentMethod)) {
            await refundToWallet(
                order.userId.toString(),
                refundAmount,
                order._id,
                `Refund for cancelled order ${order.orderId}`
            );
        }

        const successMsg = paidMethods.includes(order.paymentMethod) && refundAmount > 0
            ? `Order+cancelled.+₹${refundAmount.toFixed(2)}+refunded+to+your+wallet.`
            : `Order+cancelled+successfully`;
        return res.redirect(`/orders/${orderId}?success=${successMsg}`);

    } catch (err) {
        console.error('cancelOrder error:', err.message);
        return res.redirect(`/orders/${orderId}?error=Failed+to+cancel+order`);
    }
};



export const returnItem = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const { orderId, itemId } = req.params;
    const reason = (req.body.reason || '').trim();

    if (!reason) return res.redirect(`/orders/${orderId}?error=Return+reason+is+required`);

    try {
        const order = await Order.findById(orderId);

        if (!order || order.userId.toString() !== req.session.user.id)
            return res.redirect('/orders?error=Order+not+found');

        const item = order.items.id(itemId);
        if (!item) return res.redirect(`/orders/${orderId}?error=Item+not+found`);

        if (item.itemStatus !== 'delivered')
            return res.redirect(`/orders/${orderId}?error=Only+delivered+items+can+be+returned`);

 
        const returnWindowDays = order.returnWindowDays || 7;
        const deliveredAt      = order.deliveredAt ? new Date(order.deliveredAt) : null;
        if (!deliveredAt) {
            return res.redirect(`/orders/${orderId}?error=Return+window+not+available`);
        }
        const daysSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceDelivery > returnWindowDays) {
            return res.redirect(`/orders/${orderId}?error=Return+window+of+${returnWindowDays}+days+has+expired`);
        }

        item.itemStatus   = 'return_requested';
        item.returnReason = reason;
        item.attention    = 1;


        const allStatuses = order.items.map(i => i.itemStatus);
        if (allStatuses.every(s => s === 'return_requested' || s === 'cancelled')) {
            order.status = 'return_requested';
            order.items.forEach(i => { i.attention = 1; });
        }

        await order.save();
        if (['returned', 'cancelled'].includes(order.status) && order.couponId) {
            await refundCouponUsage(order.couponId, order.userId);
        }
        return res.redirect(`/orders/${orderId}?success=Return+request+submitted`);

    } catch (err) {
        console.error('returnItem error:', err.message);
        return res.redirect(`/orders/${orderId}?error=Failed+to+submit+return+request`);
    }
};


export const returnOrder = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const { orderId } = req.params;
    const reason = (req.body.reason || '').trim();

    if (!reason) return res.redirect(`/orders/${orderId}?error=Return+reason+is+required`);

    try {
        const order = await Order.findById(orderId);

        if (!order || order.userId.toString() !== req.session.user.id)
            return res.redirect('/orders?error=Order+not+found');

        if (order.status !== 'delivered')
            return res.redirect(`/orders/${orderId}?error=Only+delivered+orders+can+be+returned`);

    
        const returnWindowDays  = order.returnWindowDays || 7;
        const deliveredAt       = order.deliveredAt ? new Date(order.deliveredAt) : null;
        if (!deliveredAt)
            return res.redirect(`/orders/${orderId}?error=Return+window+not+available`);

        const daysSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceDelivery > returnWindowDays)
            return res.redirect(`/orders/${orderId}?error=Return+window+of+${returnWindowDays}+days+has+expired`);

       
        for (const item of order.items) {
            
            if (item.itemStatus === 'delivered' && !item.returnDeniedReason && item.flaggedresponse===0) {
                item.itemStatus   = 'return_requested';
                item.returnReason = reason;
                item.attention    = 1;
            }
        }

        order.status = 'return_requested';
        order.items.forEach(i => { i.attention = 1; });

        await order.save();
        return res.redirect(`/orders/${orderId}?success=Return+request+submitted+for+entire+order`);

    } catch (err) {
        console.error('returnOrder error:', err.message);
        return res.redirect(`/orders/${orderId}?error=Failed+to+submit+return+request`);
    }
};


export const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { couponId } = req.body;

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const subtotal = cart.items.reduce((s, i) => s + (i.productId.price * i.quantity), 0);
        
        let discount = 0;
        if (couponId) {
            const coupon = await Coupon.findById(couponId);
            if (coupon) discount = coupon.computeDiscount(subtotal);
        }

        const shippingFee = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        const finalTotal = (subtotal + shippingFee) - discount;

        const rzpOrder = await razorpay.orders.create({
            amount: Math.round(finalTotal * 100),
            currency: 'USD',
            receipt: `rcpt_${Date.now()}`
        });

        res.json({
            id: rzpOrder.id,
            amount: rzpOrder.amount,
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        console.error('Rzp Order Create Error:', err);
        res.status(500).json({ error: 'Order preparation failed' });
    }
};



export const verifyRazorpayPayment = async (req, res) => {
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;
    const userId = req.session.user.id;

    try {
      
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
        if (hmac.digest('hex') !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }


        const pending = req.session.pendingOrderData;
        if (!pending) {
            return res.status(400).json({ success: false, message: 'Session expired. Please try again.' });
        }

  
        let order;
        if (pending.retryOrderId) {
            
            order = await Order.findByIdAndUpdate(
                pending.retryOrderId,
                {
                    paymentStatus: 'paid',
                    status:        'pending',
                    
                    subtotal:      pending.subtotal,
                    shippingFee:   pending.shippingFee,
                    discount:      pending.discount || 0,
                    total:         pending.total,
                },
                { new: true }
            );
        }
        if (!order) {
            order = await Order.create({
                userId,
                items:           pending.orderItems,
                subtotal:        pending.subtotal,
                shippingFee:     pending.shippingFee,
                discount:        pending.discount || 0,
                total:           pending.total,
                shippingAddress: pending.shippingAddress,
                paymentMethod:   'online',
                paymentStatus:   'paid',
                status:          'pending',
            });
        }


        if (pending.couponId) {
            await recordCouponUsage(pending.couponId, userId);
        }
        


        await Payment.create({
            orderId:          order._id,
            userId,
            gateway:          'razorpay',
            gatewayOrderId:   razorpay_order_id,
           
            gatewayPaymentId: razorpay_payment_id,
            gatewaySignature: razorpay_signature,
            amount:           Math.round(pending.total * 100),
            status:           'captured',
        });

        
        
        
        
        if (!pending.isRetry) {
           
        for (const oi of pending.orderItems) {
            const p = await Product.findById(oi.productId);
            if (p) {
                p.stockQuantity = Math.max(0, p.stockQuantity - oi.quantity);
                p.outOfstock    = p.stockQuantity === 0;
                await p.save();
            }
        }
        } else {
            
            for (const oi of pending.orderItems) {
                const p = await Product.findById(oi.productId);
                if (p) {
                    p.stockQuantity = Math.max(0, p.stockQuantity - oi.quantity);
                    p.outOfstock    = p.stockQuantity === 0;
                    await p.save();
                }
            }
        }

        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
        delete req.session.pendingOrderData;

        res.json({ success: true, redirectUrl: `/orders/${order._id}/success` });

    } catch (err) {
        console.error('verifyRazorpayPayment error:', err.message);
        res.status(500).json({ success: false, message: 'Verification failed. Please contact support.' });
    }
};


export const handlePaymentFailure = async (req, res) => {
    try {
        const { razorpay_order_id, error_code, error_description } = req.body;

        await Payment.findOneAndUpdate(
            { gatewayOrderId: razorpay_order_id },
            {
                status:        'failed',
                failureCode:   error_code        || '',
                failureReason: error_description || 'Payment failed',
            }
        );

        
        const pending = req.session?.pendingOrderData;
        if (pending) {
            const orderIdToUpdate = pending.retryOrderId || pending.orderId || null;
            if (orderIdToUpdate) {
                await Order.findByIdAndUpdate(orderIdToUpdate, {
                    status:        'failed',
                    paymentStatus: 'failed',
                });
            } else if (razorpay_order_id) {
               
                const failedPayment = await Payment.findOne({ gatewayOrderId: razorpay_order_id });
                if (failedPayment?.orderId) {
                    await Order.findByIdAndUpdate(failedPayment.orderId, {
                        status:        'failed',
                        paymentStatus: 'failed',
                    });
                }
            }
            
        }

        return res.redirect(`/checkout/payment-failed?reason=${encodeURIComponent(error_description || 'Payment failed')}`);

    } catch (err) {
        console.error('handlePaymentFailure error:', err.message);
        res.redirect('/checkout?error=Payment+failed');
    }
};



export const downloadInvoice = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    try {
        const user  = await User.findById(req.session.user.id).lean();
        const order = await Order.findById(req.params.id).lean();

        if (!order || order.userId.toString() !== req.session.user.id)
            return res.status(403).send('Access denied');

        const a = order.shippingAddress || {};
        const itemRows = order.items.map(item => `
            <tr>
                <td>${item.productName}</td>
                <td>${item.sku || '—'}</td>
                <td style="text-align:center;">${item.quantity}</td>
                <td style="text-align:right;">$${item.price.toFixed(2)}</td>
                <td style="text-align:right;">$${item.lineTotal.toFixed(2)}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Invoice #${order.orderId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #E63946; padding-bottom: 20px; }
  .brand { font-size: 2rem; font-weight: 900; letter-spacing: 2px; }
  .brand span { color: #E63946; }
  .invoice-label { font-size: 1.5rem; font-weight: 700; color: #E63946; text-align: right; }
  .invoice-meta { font-size: 0.85rem; color: #555; text-align: right; margin-top: 4px; }
  .section { margin-bottom: 28px; }
  .section h4 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; }
  .section p { font-size: 0.9rem; line-height: 1.6; }
  .cols { display: flex; gap: 40px; }
  .cols .section { flex: 1; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  thead { background: #111; color: #fff; }
  thead th { padding: 10px 12px; text-align: left; }
  tbody tr:nth-child(even) { background: #f9f9f9; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; }
  .totals-table { margin-left: auto; width: 280px; margin-top: 20px; }
  .totals-table td { padding: 6px 12px; font-size: 0.88rem; }
  .totals-table .grand { font-size: 1rem; font-weight: 700; color: #E63946; border-top: 2px solid #E63946; }
  .footer { margin-top: 50px; text-align: center; font-size: 0.78rem; color: #aaa; border-top: 1px solid #eee; padding-top: 16px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">COMIZON<span>.</span></div>
      <p style="font-size:0.8rem;color:#888;margin-top:4px;">Premium Comic Book Store</p>
    </div>
    <div>
      <div class="invoice-label">INVOICE</div>
      <div class="invoice-meta">#${order.orderId}</div>
      <div class="invoice-meta">Date: ${new Date(order.orderedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
      <div class="invoice-meta">Payment: ${order.paymentMethod?.toUpperCase() || 'COD'}</div>
    </div>
  </div>

  <div class="cols">
    <div class="section">
      <h4>Bill To</h4>
      <p><strong>${user.firstName} ${user.lastName}</strong><br>
         ${user.email}<br>
         ${user.phone || ''}</p>
    </div>
    <div class="section">
      <h4>Ship To</h4>
      <p>${a.addressLane1 || ''}<br>
         ${a.addressLane2 ? a.addressLane2 + '<br>' : ''}
         ${a.city || ''}${a.state ? ', ' + a.state : ''}<br>
         ${a.pincode || ''} ${a.country || ''}</p>
    </div>
    <div class="section">
      <h4>Order Status</h4>
      <p><strong>${order.status.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</strong><br>
         Payment: ${order.paymentStatus.charAt(0).toUpperCase()+order.paymentStatus.slice(1)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Product</th><th>SKU</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="totals-table">
    <tr><td>Subtotal</td><td style="text-align:right;">$${order.subtotal.toFixed(2)}</td></tr>
    <tr><td>Shipping</td><td style="text-align:right;">${order.shippingFee === 0 ? 'FREE' : '$' + order.shippingFee.toFixed(2)}</td></tr>
    <tr class="grand"><td><strong>Grand Total</strong></td><td style="text-align:right;"><strong>$${order.total.toFixed(2)}</strong></td></tr>
  </table>

  <div class="footer">
    Thank you for shopping with Comizon! • For support, email support@comizon.com
    <script>window.onload = () => window.print();</script>
  </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (err) {
        console.error('downloadInvoice error:', err.message);
        res.redirect(`/orders/${req.params.id}?error=Failed+to+generate+invoice`);
    }
};
