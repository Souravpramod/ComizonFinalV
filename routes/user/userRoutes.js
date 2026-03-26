import express from 'express';
import { checkBlocked } from '../../middlewares/authMiddleware.js';
import passport from 'passport';
import { getHome, getAmerican, getManga, getToys, getPremium } from '../../controllers/user/pageController.js';
import { getProductDetail, getWriteReview, postWriteReview } from '../../controllers/user/productDetailController.js';
import {
    getLogin, postLogin, getSignup, postSignup,
    getVerifyOtp, postVerifyOtp, postResendOtp,
    getForgotPassword, postForgotPassword,
    getResetPassword, postResetPassword, getLogout,
    getfChangePassword,
    postfChangePassword,
} from '../../controllers/user/authController.js';
import {
    getProfile, getEditProfile, postEditProfile,
    getChangePassword, postChangePassword
} from '../../controllers/user/profileController.js';
import {
    getAddresses, postAddAddress, postEditAddress,
    postDeleteAddress, postDefaultAddress
} from '../../controllers/user/AddressController.js';
import {
    getWishlist, addToWishlist, removeFromWishlist, moveToCart
} from '../../controllers/user/wishlistController.js';
import {
    getCart, addToCart, updateCartItem, removeFromCart
} from '../../controllers/user/cartController.js';

const router = express.Router();

// Apply block check to every user route
router.use(checkBlocked);

const requireUser = (req, res, next) => {
    if (req.session?.user?.role === 'user') return next();
    return res.redirect('/login');
};

const requireGuest = (req, res, next) => {
    if (req.session?.user) return res.redirect('/profile');
    return next();
};



// ── Listing pages ─────────────────────────────────────────────────────────────
router.get('/', getHome);
router.get('/american', getAmerican);
router.get('/manga', getManga);
router.get('/toys', getToys);
router.get('/about', (req, res) => {
    res.render('user/about', { title: 'About Us' });
});
router.get('/premium', getPremium);

// ── Product detail + reviews ──────────────────────────────────────────────────
router.get('/product/:id', getProductDetail);
router.get('/product/:id/review', getWriteReview);
router.post('/product/:id/review', postWriteReview);

// ── Wishlist ──────────────────────────────────────────────────────────────────
router.get('/wishlist',                          requireUser, getWishlist);
router.post('/wishlist/add/:productId',          requireUser, addToWishlist);
router.post('/wishlist/remove/:productId',       requireUser, removeFromWishlist);
router.post('/wishlist/move-to-cart/:productId', requireUser, moveToCart);

// ── Cart ──────────────────────────────────────────────────────────────────────
router.get('/cart',                       requireUser, getCart);
router.post('/cart/add/:productId',       requireUser, addToCart);
router.post('/cart/update/:productId',    requireUser, updateCartItem);
router.post('/cart/remove/:productId',    requireUser, removeFromCart);

// ── Auth ──────────────────────────────────────────────────────────────────────
router.get('/login',  requireGuest, getLogin);
router.post('/login', requireGuest, postLogin);

router.get('/signup',  requireGuest, getSignup);
router.post('/signup', requireGuest, postSignup);

router.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        if (req.user.isBlocked) return res.redirect('/blocked');
        req.session.user = { id: req.user._id, email: req.user.email, role: req.user.role, isPremium: req.user.isPremium };
        res.redirect('/');
    }
);
// ── changepassword ──────────────────────────────────────────────────────────────────────
router.get('/verify-otp',requireGuest, getVerifyOtp);
router.post('/verify-otp',requireGuest, postVerifyOtp);
router.post('/resend-otp',requireGuest, postResendOtp);

router.get('/forgot-password',  requireGuest, getForgotPassword);
router.post('/forgot-password', requireGuest, postForgotPassword);

router.get('/reset-password',requireGuest , getResetPassword);
router.post('/reset-password', requireGuest,postResetPassword);

router.get('/change-password',requireGuest, getfChangePassword);
router.post('/change-password',requireGuest, postfChangePassword);


router.get('/profile',                  requireUser, getProfile);
router.get('/profile/edit',             requireUser, getEditProfile);
router.post('/profile/edit',            requireUser, postEditProfile);
router.get('/profile/change-password',  requireUser, getChangePassword);
router.post('/profile/change-password', requireUser, postChangePassword);

router.get('/profile/address',               requireUser, getAddresses);
router.post('/profile/address/add',          requireUser, postAddAddress);
router.post('/profile/address/edit/:id',     requireUser, postEditAddress);
router.post('/profile/address/delete/:id',   requireUser, postDeleteAddress);
router.post('/profile/address/default/:id',  requireUser, postDefaultAddress);


router.get('/blocked', (req, res) => res.render('user/blocked', { title: 'Account Blocked' }));

router.get('/logout', getLogout);

export default router;