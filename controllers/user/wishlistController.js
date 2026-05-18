import mongoose from 'mongoose';
import Wishlist from '../../models/Wishlist.js';
import Cart    from '../../models/Cart.js';
import Product from '../../models/Product.js';
import { getBestOfferForProduct } from '../admin/offerController.js';



export const getWishlist = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    try {
        const wishlist = await Wishlist.findOne({ userId: req.session.user.id })
            .populate({
                path:   'products.productId',
                select: 'productName images price categoryId isActive outOfstock',
                populate: { path: 'categoryId', select: 'categoryName' },
            })
            .lean();


        const rawItems = (wishlist?.products || []).filter(p => p.productId);

        const items = await Promise.all(rawItems.map(async (p) => {
            const prod = p.productId;
            const offerResult = await getBestOfferForProduct(
                prod._id,
                prod.categoryId?._id || prod.categoryId,
                prod.price
            );
            return {
                _id:            prod._id.toString(),
                name:           prod.productName,
                image:          prod.images?.[0] || '',
                price:          prod.price,
                effectivePrice: offerResult ? offerResult.effectivePrice : prod.price,
                hasOffer:       !!offerResult,
                offerBadge:     offerResult
                                  ? (offerResult.discountType === 'flat'
                                      ? `$${offerResult.discountValue} OFF`
                                      : `${offerResult.discountValue}% OFF`)
                                  : null,
                badgeColor:     offerResult?.badgeColorListing || '#E63946',
                category:       prod.categoryId?.categoryName || '',
                addedAt:        p.addedAt,
                isActive:       prod.isActive,
                outOfstock:     prod.outOfstock,
            };
        }));

        res.render('user/wishlist', {
            title:         'My Wishlist',
            wishlistItems: items,
            success:       req.query.success || null,
            error:         req.query.error   || null,
        });

    } catch (err) {
        console.error('getWishlist error:', err.message);
        res.render('user/wishlist', {
            title:         'My Wishlist',
            wishlistItems: [],
            success:       null,
            error:         'Failed to load wishlist.',
        });
    }
};



export const addToWishlist = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.redirect('/wishlist?error=Invalid+product');
    }

    try {
        const product = await Product.findById(productId).lean();
        if (!product) return res.redirect('/wishlist?error=Product+not+found');

        const wishlist = await Wishlist.findOne({ userId: req.session.user.id });
        const alreadyIn = wishlist?.products?.some(
            p => p.productId.toString() === productId
        );

        if (alreadyIn) {
            await Wishlist.findOneAndUpdate(
                { userId: req.session.user.id },
                { $pull: { products: { productId: new mongoose.Types.ObjectId(productId) } } }
            );
        } else {
            await Wishlist.findOneAndUpdate(
                { userId: req.session.user.id },
                { $push: { products: { productId: new mongoose.Types.ObjectId(productId) } } },
                { upsert: true }
            );
        }

        const newCount = await Wishlist.findOne({ userId: req.session.user.id })
            .select('products').lean()
            .then(w => w?.products?.length || 0);

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({ ok: true, wishlisted: !alreadyIn, count: newCount });
        }
        const back = req.headers.referer || '/wishlist';
        return res.redirect(back + (back.includes('?') ? '&' : '?') + 'wishlisted=1');

    } catch (err) {
        console.error('addToWishlist error:', err.message);
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({ ok: false, message: 'Failed to update wishlist' });
        }
        return res.redirect('/wishlist?error=Failed+to+add+to+wishlist');
    }
};



export const removeFromWishlist = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.redirect('/wishlist?error=Invalid+product');
    }

    try {
        await Wishlist.findOneAndUpdate(
            { userId: req.session.user.id },
            { $pull: { products: { productId } } }
        );

        return res.redirect('/wishlist?success=Item+removed+from+wishlist');

    } catch (err) {
        console.error('removeFromWishlist error:', err.message);
        return res.redirect('/wishlist?error=Failed+to+remove+item');
    }
};



export const moveToCart = async (req, res) => {

    if (!req.session?.user?.id) return res.redirect('/login');

    const { productId } = req.params;
    const userId = req.session.user.id;
    const MAX_QTY = 6;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.redirect('/wishlist?error=Invalid+product');
    }

    try {

        const product = await Product.findById(productId).lean();
        if (!product) return res.redirect('/wishlist?error=Product+not+found');

        // Block inactive products
        if (!product.isActive) {
            return res.redirect('/wishlist?error=This+product+is+no+longer+available');
        }

        // Block out-of-stock (flag OR quantity check)
        if (product.outOfstock || product.stockQuantity <= 0) {
            return res.redirect('/wishlist?error=This+product+is+out+of+stock');
        }

        if (product.isPremium) {
            const User = (await import('../../models/Users.js')).default;
            const user = await User.findById(userId).lean();
            if (!user?.isPremium) {
                return res.redirect('/wishlist?error=This+is+a+premium+product.+Upgrade+to+a+premium+membership+to+add+it+to+your+cart.');
            }
        }

        const cart = await Cart.findOne({ userId });

        if (cart) {
            const existing = cart.items.find(i => i.productId.toString() === productId);

            if (existing) {
                // Already in cart — check both the 6-item cap and the actual stock
                const maxAllowed = Math.min(MAX_QTY, product.stockQuantity);
                if (existing.quantity >= maxAllowed) {
                    const reason = existing.quantity >= product.stockQuantity
                        ? 'No+more+stock+available+for+this+product'
                        : 'You+already+have+the+maximum+quantity+in+your+cart';
                    return res.redirect(`/wishlist?error=${reason}`);
                }
                existing.quantity += 1;
            } else {
                // Not in cart yet — still make sure at least 1 unit is available
                if (product.stockQuantity < 1) {
                    return res.redirect('/wishlist?error=This+product+is+out+of+stock');
                }
                cart.items.push({ productId });
            }

            await cart.save();

        } else {
            await Cart.create({ userId, items: [{ productId }] });
        }

        // Remove from wishlist after successful move
        await Wishlist.findOneAndUpdate(
            { userId },
            { $pull: { products: { productId } } }
        );

        return res.redirect('/wishlist?success=Item+moved+to+cart');

    } catch (err) {
        console.error('moveToCart error:', err.message);
        return res.redirect('/wishlist?error=Failed+to+move+to+cart');
    }
};

export const getWishlistStockCheck = async (req, res) => {
    if (!req.session?.user?.id) return res.status(401).json({ ok: false });

    try {
        const wishlist = await Wishlist.findOne({ userId: req.session.user.id })
            .populate({
                path:   'products.productId',
                select: 'productName isActive outOfstock stockQuantity',
            })
            .lean();

        if (!wishlist) return res.json({ ok: true, items: [] });

        const items = (wishlist.products || [])
            .filter(p => p.productId)
            .map(p => ({
                productId:  p.productId._id.toString(),
                name:       p.productId.productName,
                blocked:    !p.productId.isActive,
                outOfstock: p.productId.outOfstock || p.productId.stockQuantity === 0,
            }));

        return res.json({ ok: true, items });

    } catch (err) {
        console.error('getWishlistStockCheck error:', err.message);
        return res.status(500).json({ ok: false });
    }
};


export const moveAllToCart = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');
    const userId = req.session.user.id;

    try {
        const wishlist = await Wishlist.findOne({ userId })
            .populate({
                path:   'products.productId',
                select: 'productName isActive outOfstock stockQuantity isPremium',
            })
            .lean();

        if (!wishlist || wishlist.products.length === 0)
            return res.redirect('/wishlist?error=Your+wishlist+is+empty');

        const User = (await import('../../models/Users.js')).default;
        const currentUser = await User.findById(userId).lean();
        const isUserPremium = !!currentUser?.isPremium;

        // Separate all valid products into out-of-stock vs eligible
        const validItems = wishlist.products.filter(
            p => p.productId && p.productId.isActive && (!p.productId.isPremium || isUserPremium)
        );

        const outOfStockItems = validItems.filter(
            p => p.productId.outOfstock || p.productId.stockQuantity < 1
        );

        // Block entirely if ANY item is out of stock — show which ones
        if (outOfStockItems.length > 0) {
            const names = outOfStockItems.map(p => p.productId.productName).join(', ');
            return res.redirect(`/wishlist?error=${encodeURIComponent('Cannot move all to cart. Out of stock: ' + names)}`);
        }

        const eligible = validItems.filter(
            p => !p.productId.outOfstock && p.productId.stockQuantity >= 1
        );

        if (eligible.length === 0)
            return res.redirect('/wishlist?error=No+available+items+to+add+to+cart');

        let cart = await Cart.findOne({ userId });
        if (!cart) cart = await Cart.create({ userId, items: [] });

        const MAX_QTY = 6;
        for (const p of eligible) {
            const productId = p.productId._id.toString();
            const stock     = p.productId.stockQuantity;
            const existing  = cart.items.find(i => i.productId.toString() === productId);

            if (existing) {
                const maxAllowed = Math.min(MAX_QTY, stock);
                if (existing.quantity < maxAllowed) {
                    existing.quantity += 1;
                }
            } else {
                cart.items.push({ productId: p.productId._id });
            }
        }
        await cart.save();

        const eligibleIds = eligible.map(p => new mongoose.Types.ObjectId(p.productId._id));
        await Wishlist.findOneAndUpdate(
            { userId },
            { $pull: { products: { productId: { $in: eligibleIds } } } }
        );

        return res.redirect('/wishlist?success=All+items+moved+to+cart');

    } catch (err) {
        console.error('moveAllToCart error:', err.message);
        return res.redirect('/wishlist?error=Failed+to+add+all+to+cart');
    }
};