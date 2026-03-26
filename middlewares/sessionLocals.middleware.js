import Wishlist from '../models/Wishlist.js';
import Cart     from '../models/Cart.js';

export const injectSessionLocals = async (req, res, next) => {

    res.locals.sessionUser   = req.session?.user || null;
    res.locals.wishlistCount = 0;
    res.locals.cartCount     = 0;

    const userId = req.session?.user?.id;

    if (userId) {
        try {
            const [wishlist, cart] = await Promise.all([
                Wishlist.findOne({ userId }).select('products').lean(),
                Cart.findOne({ userId }).select('items').lean(),
            ]);

            res.locals.wishlistCount = wishlist?.products?.length || 0;
            res.locals.cartCount     = cart?.items?.reduce((n, i) => n + (i.quantity || 1), 0) || 0;

        } catch (err) {
            console.error('sessionLocals count error:', err.message);
        }
    }

    next();
};