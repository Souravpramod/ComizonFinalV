import mongoose from 'mongoose';
import Cart    from '../../models/Cart.js';
import Product from '../../models/Product.js';
import Order   from '../../models/Order.js';
import { getBestOfferForProduct } from '../admin/offerController.js';

const SHIPPING_FEE  = 5;
const FREE_SHIPPING = 500; 



export const getCart = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    try {
        const cart = await Cart.findOne({ userId: req.session.user.id })
            .populate({
                path:   'items.productId',
                select: 'productName images price categoryId stockQuantity outOfstock isActive',
                populate: { path: 'categoryId', select: 'categoryName' },
            })
            .lean();


        const rawItems = (cart?.items || []).filter(i => i.productId);


        const cartItems = await Promise.all(rawItems.map(async (i) => {
            const prod = i.productId;
            const offerResult = await getBestOfferForProduct(
                prod._id,
                prod.categoryId?._id || prod.categoryId,
                prod.price
            );
            const effectivePrice = offerResult ? offerResult.effectivePrice : prod.price;
            const hasOffer       = !!offerResult;
            return {
                _id:            prod._id.toString(),
                name:           prod.productName,
                image:          prod.images?.[0] || '',
                price:          prod.price,           
                effectivePrice,                       
                hasOffer,
                offerBadge:     hasOffer
                                  ? (offerResult.discountType === 'flat'
                                      ? `₹${offerResult.discountValue} OFF`
                                      : `${offerResult.discountValue}% OFF`)
                                  : null,
                badgeColor:     offerResult?.badgeColorDetail || '#E63946',
                category:       prod.categoryId?.categoryName || '',
                quantity:       i.quantity,
                stock:          prod.stockQuantity,
                outOfstock:     prod.outOfstock,
                isActive:       prod.isActive,
                lineTotal:      +(effectivePrice * i.quantity).toFixed(2),
            };
        }));

        const subtotal = +cartItems.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2);
        const shipping = cartItems.length === 0 ? 0 : subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        const total    = +(subtotal + shipping).toFixed(2);

        res.render('user/cart', {
            title:     'Your Cart',
            cartItems,
            subtotal,
            shipping,
            total,
            itemCount: cartItems.reduce((n, i) => n + i.quantity, 0),
            success:   req.query.success || null,
            error:     req.query.error   || null,
        });

    } catch (err) {
        console.error('getCart error:', err.message);
        res.render('user/cart', {
            title:     'Your Cart',
            cartItems: [],
            subtotal:  0,
            shipping:  0,
            total:     0,
            itemCount: 0,
            success:   null,
            error:     'Failed to load cart.',
        });
    }
};



export const addToCart = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    const { productId } = req.params;
    const userId = req.session.user.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.redirect('/cart?error=Invalid+product');
    }

    try {
        const product = await Product.findById(productId).lean();
        if (!product)           return res.redirect('/cart?error=Product+not+found');
        if (product.outOfstock || product.stockQuantity < 1) {
            return res.redirect('/cart?error=Product+is+out+of+stock');
        }

        
        if (product.isPremium) {
            const User = (await import('../../models/Users.js')).default;
            const user = await User.findById(userId).lean();
            if (!user?.isPremium) {
                const back = req.headers.referer || '/cart';
                return res.redirect(back + (back.includes('?') ? '&' : '?') +
                    'error=This+is+a+premium+product.+Upgrade+to+a+premium+membership+to+add+it+to+your+cart.');
            }
        }
        

        const cart = await Cart.findOne({ userId });
        const MAX_QTY = 6;

        if (cart) {
            const existing = cart.items.find(i => i.productId.toString() === productId);
            if (existing) {
                
                if (existing.quantity >= product.stockQuantity) {
                    const back = req.headers.referer || '/cart';
                    return res.redirect(back + (back.includes('?') ? '&' : '?') + `error=Only+${product.stockQuantity}+unit(s)+available.+You+already+have+the+maximum+in+your+cart.`);
                }
             
                if (existing.quantity >= MAX_QTY) {
                    const back = req.headers.referer || '/cart';
                    return res.redirect(back + (back.includes('?') ? '&' : '?') + 'error=Maximum+quantity+of+6+per+item+reached');
                }
                existing.quantity += 1;
            } else {
                cart.items.push({ productId });
            }
            await cart.save();
        } else {
            await Cart.create({ userId, items: [{ productId }] });
        }

        const back = req.headers.referer || '/cart';
        return res.redirect(back + (back.includes('?') ? '&' : '?') + 'added=1');

    } catch (err) {
        console.error('addToCart error:', err.message);
        return res.redirect('/cart?error=Failed+to+add+to+cart');
    }
};



export const updateCartItem = async (req, res) => {

    if (!req.session?.user?.id) {
        return res.status(401).json({ ok: false, message: 'Please log in.' });
    }

    const { productId } = req.params;
    const qty = parseInt(req.body.quantity, 10);

    if (!mongoose.Types.ObjectId.isValid(productId) || isNaN(qty) || qty < 1) {
        return res.status(400).json({ ok: false, message: 'Invalid quantity.' });
    }

    try {
        const product = await Product.findById(productId).lean();

        if (!product) {
            return res.status(404).json({ ok: false, message: 'Product not found.' });
        }
        if (!product.isActive) {
            return res.status(403).json({ ok: false, blocked: true, message: 'This product has been blocked by the admin.' });
        }

        const MAX_QTY = 6;
        const safeQty = Math.min(qty, product.stockQuantity, MAX_QTY);

        await Cart.findOneAndUpdate(
            { userId: req.session.user.id, 'items.productId': productId },
            { $set: { 'items.$.quantity': safeQty } }
        );

       
        const cart = await Cart.findOne({ userId: req.session.user.id })
            .populate({
                path: 'items.productId',
                select: 'price categoryId stockQuantity outOfstock isActive',
            })
            .lean();

        const SHIPPING_FEE  = 5;
        const FREE_SHIPPING = 500;

        const rawCartItems = (cart?.items || []).filter(i => i.productId);
        const items = await Promise.all(rawCartItems.map(async (i) => {
            const prod = i.productId;
            const ofr  = await getBestOfferForProduct(prod._id, prod.categoryId, prod.price);
            const ep   = ofr ? ofr.effectivePrice : prod.price;
            return {
                _id:       prod._id.toString(),
                quantity:  i.quantity,
                price:     prod.price,
                effectivePrice: ep,
                lineTotal: +(ep * i.quantity).toFixed(2),
            };
        }));

        const subtotal  = +items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
        const shipping  = items.length === 0 ? 0 : subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        const total     = +(subtotal + shipping).toFixed(2);
        const itemCount = items.reduce((n, i) => n + i.quantity, 0);

       
        const offerRes       = await getBestOfferForProduct(product._id, product.categoryId, product.price);
        const effectivePrice = offerRes ? offerRes.effectivePrice : product.price;

        return res.json({
            ok: true,
            updatedItem: {
                productId,
                quantity:       safeQty,
                effectivePrice,
                lineTotal:      +(effectivePrice * safeQty).toFixed(2),
            },
            subtotal,
            shipping,
            total,
            itemCount,
        });

    } catch (err) {
        console.error('updateCartItem error:', err.message);
        return res.status(500).json({ ok: false, message: 'Failed to update quantity.' });
    }
};


export const getCartStock = async (req, res) => {
    if (!req.session?.user?.id) return res.status(401).json({ ok: false });

    try {
        const cart = await Cart.findOne({ userId: req.session.user.id })
            .populate({
                path:   'items.productId',
                select: 'stockQuantity outOfstock isActive isPremium',
            })
            .lean();

        if (!cart) return res.json({ ok: true, items: [] });

        const updates = [];

       
        const User = (await import('../../models/Users.js')).default;
        const sessionUser = await User.findById(req.session.user.id).lean();
        const isUserPremium = !!sessionUser?.isPremium;

        for (const item of cart.items) {
            if (!item.productId) continue;

            const currentStock  = item.productId.stockQuantity;
            const isActive      = item.productId.isActive;
            const outOfstock    = item.productId.outOfstock;
            const isProductPremium = !!item.productId.isPremium;
            const MAX_QTY       = 6;
            const newQty        = Math.min(item.quantity, currentStock, MAX_QTY);

            
            const isPremiumLocked = isProductPremium && !isUserPremium;

            
            if (!isPremiumLocked && newQty !== item.quantity && newQty > 0) {
                await Cart.findOneAndUpdate(
                    { userId: req.session.user.id, 'items.productId': item.productId._id },
                    { $set: { 'items.$.quantity': newQty } }
                );
            }

            updates.push({
                productId:      item.productId._id.toString(),
                stock:          currentStock,
                quantity:       newQty > 0 ? newQty : item.quantity,
                outOfstock:     outOfstock || currentStock === 0,
                isActive,
                reduced:        newQty < item.quantity && newQty > 0,
                blocked:        !isActive,
                isPremiumLocked,   
            });
        }

        return res.json({ ok: true, items: updates });

    } catch (err) {
        console.error('getCartStock error:', err.message);
        return res.status(500).json({ ok: false });
    }
};

export const removeFromCart = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.redirect('/cart?error=Invalid+product');
    }

    try {
        await Cart.findOneAndUpdate(
            { userId: req.session.user.id },
            { $pull: { items: { productId } } }
        );

        return res.redirect('/cart?success=Item+removed');

    } catch (err) {
        console.error('removeFromCart error:', err.message);
        return res.redirect('/cart?error=Failed+to+remove+item');
    }
};


export const placeOrder = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    const userId = req.session.user.id;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const cart = await Cart.findOne({ userId })
            .populate({
                path:   'items.productId',
                select: 'productName images price stockQuantity outOfstock isActive sku',
            })
            .session(session)
            .lean();

        if (!cart || cart.items.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.redirect('/cart?error=Your+cart+is+empty');
        }

        const validItems = cart.items.filter(i => i.productId && i.productId.isActive);

        if (validItems.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.redirect('/cart?error=No+valid+items+in+cart');
        }

        const orderItems = [];

        for (const cartItem of validItems) {
            const product = cartItem.productId;
            const qty     = cartItem.quantity;

            const updated = await Product.findOneAndUpdate(
                { _id: product._id, stockQuantity: { $gte: qty } },
                { $inc: { stockQuantity: -qty } },
                { new: true, session }
            );

            if (!updated) {
                await session.abortTransaction();
                session.endSession();
                return res.redirect(
                    `/cart?error=Sorry,+insufficient+stock+for+${encodeURIComponent(product.productName)}`
                );
            }

            updated.outOfstock = updated.stockQuantity === 0;
            await updated.save({ session });

            const unitStatuses = Array.from({ length: qty }, (_, i) => ({
                unitIndex: i,
                status: 'pending',
            }));

            orderItems.push({
                productId:    product._id,
                productName:  product.productName,
                sku:          product.sku || '',
                image:        product.images?.[0] || '',
                price:        product.price,
                quantity:     qty,
                lineTotal:    +(product.price * qty).toFixed(2),
                unitStatuses,
            });
        }

        const subtotal    = +orderItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
        const shippingFee = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
        const total       = +(subtotal + shippingFee).toFixed(2);

        const { shippingAddress = {} } = req.body;

        const [order] = await Order.create([{
            userId,
            items:    orderItems,
            status:   'pending',
            subtotal,
            shippingFee,
            total,
            shippingAddress,
            paymentMethod: req.body.paymentMethod || 'cod',
            paymentStatus: 'pending',
        }], { session });

        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } }, { session });

        await session.commitTransaction();
        session.endSession();

        return res.redirect(`/orders/${order._id}?success=Order+placed+successfully`);

    } catch (err) {
        await session.abortTransaction().catch(() => {});
        session.endSession();
        console.error('placeOrder error:', err.message);
        return res.redirect('/cart?error=Failed+to+place+order.+Please+try+again.');
    }
};


export const getCartOfferPrices = async (req, res) => {
    if (!req.session?.user?.id) return res.status(401).json({ ok: false });

    try {
        const cart = await Cart.findOne({ userId: req.session.user.id })
            .populate({
                path:   'items.productId',
                select: 'price categoryId stockQuantity outOfstock isActive',
            })
            .lean();

        if (!cart) return res.json({ ok: true, items: [] });

        const items = await Promise.all(
            cart.items
                .filter(i => i.productId)
                .map(async (i) => {
                    const prod = i.productId;
                    const ofr  = await getBestOfferForProduct(
                        prod._id,
                        prod.categoryId,
                        prod.price
                    );
                    const effectivePrice = ofr ? ofr.effectivePrice : prod.price;
                    return {
                        productId:     prod._id.toString(),
                        quantity:      i.quantity,
                        originalPrice: prod.price,
                        effectivePrice,
                        hasOffer:      !!ofr,
                        offerBadge:    ofr
                            ? (ofr.discountType === 'flat'
                                ? `₹${ofr.discountValue} OFF`
                                : `${ofr.discountValue}% OFF`)
                            : null,
                        badgeColor:    ofr?.badgeColorDetail || '#E63946',
                        lineTotal:     +(effectivePrice * i.quantity).toFixed(2),
                        offerTitle:    ofr?.offerLabel || null,   
                    };
                })
        );

        return res.json({ ok: true, items });

    } catch (err) {
        console.error('getCartOfferPrices error:', err.message);
        return res.status(500).json({ ok: false });
    }
};