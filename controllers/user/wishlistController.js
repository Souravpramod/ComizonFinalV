import mongoose from 'mongoose';
import Wishlist from '../../models/Wishlist.js';
import Cart    from '../../models/Cart.js';
import Product from '../../models/Product.js';



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


        const items = (wishlist?.products || [])
            .filter(p => p.productId)
            .map(p => ({
                _id:      p.productId._id.toString(),
                name:     p.productId.productName,
                image:    p.productId.images?.[0] || '',
                price:    p.productId.price,
                category: p.productId.categoryId?.categoryName || '',
                addedAt:  p.addedAt,
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

        await Wishlist.findOneAndUpdate(
            { userId: req.session.user.id },
            { $addToSet: { products: { productId } } },
            { upsert: true }
        );


        const back = req.headers.referer || '/wishlist';
        return res.redirect(back + (back.includes('?') ? '&' : '?') + 'wishlisted=1');

    } catch (err) {
        console.error('addToWishlist error:', err.message);
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

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.redirect('/wishlist?error=Invalid+product');
    }

    try {

        const cart = await Cart.findOne({ userId });

        if (cart) {
            const existing = cart.items.find(i => i.productId.toString() === productId);
            if (existing) {
                existing.quantity += 1;
            } else {
                cart.items.push({ productId });
            }
            await cart.save();
        } else {
            await Cart.create({ userId, items: [{ productId }] });
        }

        
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
