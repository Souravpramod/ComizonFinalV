import express from 'express';
import { checkBlocked } from '../../middlewares/authMiddleware.js';
import passport from 'passport';
import { getHome, getAmerican, getManga, getToys, getPremium } from '../../controllers/user/pageController.js';
import { getSearch } from '../../controllers/user/searchController.js';
import { getProductDetail, getWriteReview, postWriteReview } from '../../controllers/user/productDetailController.js';
import {
    getLogin, postLogin, getSignup, postSignup,
    getVerifyOtp, postVerifyOtp, postResendOtp,
    getForgotPassword, postForgotPassword,
    getResetPassword, postResetPassword, getLogout,
    getfChangePassword,
    getMyStatus,
    postfChangePassword,
} from '../../controllers/user/authController.js';
import {
    getProfile, getEditProfile, postEditProfile,
    getChangePassword, postChangePassword,postRequestEmailChange, getVerifyEmailOtp,
    postVerifyEmailOtp, postResendEmailOtp,postUploadProfilePhoto,
} from '../../controllers/user/profileController.js';
import {
    getAddresses, postAddAddress, postEditAddress, postDeleteAddress, postDefaultAddress, postAddAddressAjax, validatePincodeApi,
} from '../../controllers/user/AddressController.js';
import {
    getWishlist, addToWishlist, removeFromWishlist, moveToCart,moveAllToCart,getWishlistStockCheck
} from '../../controllers/user/wishlistController.js';
import {
    getCart, addToCart, updateCartItem, removeFromCart,getCartStock,getCartOfferPrices,
} from '../../controllers/user/cartController.js';

import {
    getCheckout,
    placeOrder,
    getOrderSuccess,
    getOrders,
    getOrderDetail,
    cancelOrder,
    cancelItem,
    returnItem,
    returnOrder,
    createRazorpayOrder,
    verifyRazorpayPayment,
    handlePaymentFailure,
    getPaymentFailed,
    downloadInvoice,
} from '../../controllers/user/orderController.js';

import { getWallet, createTopupOrder, verifyTopup ,recordFailedTopup} 
from '../../controllers/user/walletController.js';

import { applyCoupon, getCouponsPage ,getCouponStatus ,} from '../../controllers/user/couponController.js';
import {
    createPremiumOrder,
    verifyPremiumPayment,
    getPremiumSuccess,
    getPremiumFailed,
} from '../../controllers/user/premiumController.js';
import checkPremium from '../../middlewares/checkPremium.js';
import { getPriceCheck } from '../../services/user/offerCheck.js';

const router = express.Router();

// Apply block check to every user route
router.use(checkBlocked);
router.use(checkPremium);



(async () => {
    try {
        const { default: UserModel } = await import('../../models/Users.js');
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const usersWithoutCode = await UserModel.find({ referralCode: { $exists: false } }).lean();
        for (const u of usersWithoutCode) {
            let code, exists;
            do {
                code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                exists = await UserModel.findOne({ referralCode: code }).lean();
            } while (exists);
            await UserModel.findByIdAndUpdate(u._id, { referralCode: code });
        }
        if (usersWithoutCode.length > 0)
            console.log(`[Referral] Backfilled codes for ${usersWithoutCode.length} existing user(s)`);
    } catch (e) {
        console.error('[Referral] Backfill error:', e.message);
    }
})();
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
router.get('/search', getSearch);
router.get('/user/my-status',requireUser, getMyStatus);
router.get('/american', getAmerican);
router.get('/manga', getManga);
router.get('/toys', getToys);
router.get('/about', (req, res) => {
    res.render('user/about', { title: 'About Us' });
});
router.get('/premium', getPremium);
router.get('/offers/price-check', getPriceCheck);
// ── Product detail + reviews ──────────────────────────────────────────────────
router.get('/product/:id', getProductDetail);
router.get('/product/:id/review', getWriteReview);
router.post('/product/:id/review', postWriteReview);

// ── Wishlist ──────────────────────────────────────────────────────────────────
router.get('/wishlist',                          requireUser, getWishlist);
router.post('/wishlist/add/:productId',          requireUser, addToWishlist);
router.post('/wishlist/remove/:productId',       requireUser, removeFromWishlist);
router.post('/wishlist/move-to-cart/:productId', requireUser, moveToCart);
router.get('/wishlist/stock-check', getWishlistStockCheck);
router.post('/wishlist/move-all-to-cart', moveAllToCart);
// ── Cart ──────────────────────────────────────────────────────────────────────
router.get('/cart',                       requireUser, getCart);
router.post('/cart/add/:productId',       requireUser, addToCart);
router.post('/cart/update/:productId',    requireUser, updateCartItem);
router.post('/cart/remove/:productId',    requireUser, removeFromCart);
router.get('/cart/stock-sync',            requireUser, getCartStock);
router.get('/cart/offer-prices',          requireUser, getCartOfferPrices);





// ── Checkout ──────────────────────────────────────────────────────────────────
router.get('/checkout',                   requireUser, getCheckout);
router.post('/checkout/place-order',      requireUser, placeOrder);
router.post('/checkout/apply-coupon',          requireUser, applyCoupon);
router.post('/checkout/razorpay/create-order', requireUser, createRazorpayOrder);
router.post('/checkout/razorpay/verify',       requireUser, verifyRazorpayPayment);
router.post('/checkout/razorpay/failure',      requireUser, handlePaymentFailure);
router.get('/checkout/payment-failed',         requireUser, getPaymentFailed);
router.get('/checkout/coupon-status',requireUser, getCouponStatus);

// ── Orders ────────────────────────────────────────────────────────────────────
router.get('/orders',                            requireUser, getOrders);
router.get('/orders/:id',                        requireUser, getOrderDetail);
router.get('/orders/:id/success',                requireUser, getOrderSuccess);
router.get('/orders/:id/invoice',                requireUser, downloadInvoice);
router.post('/orders/:orderId/items/:itemId/cancel', requireUser, cancelItem);
router.post('/orders/:orderId/items/:itemId/return', requireUser, returnItem);
router.post('/orders/:orderId/cancel',               requireUser, cancelOrder);
router.post('/orders/:orderId/return', returnOrder);
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
router.post('/profile/upload-photo',            requireUser, postUploadProfilePhoto);
router.post('/profile/request-email-change',    requireUser, postRequestEmailChange);
router.get('/profile/verify-email-otp',         requireUser, getVerifyEmailOtp);
router.post('/profile/verify-email-otp',        requireUser, postVerifyEmailOtp);
router.post('/profile/resend-email-otp',        requireUser, postResendEmailOtp);

router.get('/profile/address',               requireUser, getAddresses);
router.post('/profile/address/add',          requireUser, postAddAddress);
router.post('/profile/address/edit/:id',     requireUser, postEditAddress);
router.post('/profile/address/delete/:id',   requireUser, postDeleteAddress);
router.post('/profile/address/default/:id',  requireUser, postDefaultAddress);
router.post('/profile/address/add-ajax',     requireUser, postAddAddressAjax);
router.get('/profile/address/validate-pincode', requireUser, validatePincodeApi);

router.get('/profile/coupons', requireUser, getCouponsPage);

// ── Premium upgrade (Razorpay) ─────────────────────────────────────────────────
router.post('/premium/create-order', requireUser, createPremiumOrder);
router.post('/premium/verify',       requireUser, verifyPremiumPayment);
router.get('/premium/success',       requireUser, getPremiumSuccess);
router.get('/premium/failed',        requireUser, getPremiumFailed);

router.get('/profile/wallet',requireUser,getWallet);
router.post('/profile/wallet/topup/create', requireUser,createTopupOrder);
router.post('/profile/wallet/topup/verify',requireUser, verifyTopup);
router.post('/profile/wallet/topup/failed', requireUser, recordFailedTopup);


router.get('/blocked', (req, res) => res.render('user/blocked', { title: 'Account Blocked' }));

router.get('/logout', getLogout);

export default router;