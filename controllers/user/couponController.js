
import Coupon from '../../models/Coupon.js';
import Order  from '../../models/Order.js';
import User   from '../../models/Users.js';;


export async function getEligibleCoupons(userId, subtotal = 0) {
    const now = new Date();

    
    const completedOrders = await Order.countDocuments({
        userId,
        status: { $in: ['delivered', 'return_requested', 'returned'] },
    });

    const isNewUser = completedOrders === 0;

    
    const allCoupons = await Coupon.find({
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).lean();

    const eligible = [];

    for (const c of allCoupons) {
       
        if (c.usageLimitTotal !== null && c.usedCount >= c.usageLimitTotal) continue;

        
        const userEntry = c.usedBy?.find(u => u.userId.toString() === userId.toString());
        if (userEntry && userEntry.count >= c.usageLimitPerUser) continue;

        
        if (c.eligibility === 'new_user' && !isNewUser) continue;
        if (c.eligibility === 'loyal' && completedOrders < c.loyaltyThreshold) continue;
        const currentUser=await User.findById(userId);
        if(c.eligibility==='referred' && currentUser.referredBy===null) continue ;
      
        let discountLabel;
        if (c.discountType === 'flat') {
            discountLabel = `$${c.discountValue} OFF`;
        } else {
            discountLabel = `${c.discountValue}% OFF${c.maxDiscount ? ` (up to $${c.maxDiscount})` : ''}`;
        }

       
        let saving = 0;
        if (subtotal >= c.minOrderAmount) {
            if (c.discountType === 'flat') {
                saving = Math.min(c.discountValue, subtotal);
            } else {
                saving = Math.min(
                    +(subtotal * c.discountValue / 100).toFixed(2),
                    c.maxDiscount ?? Infinity,
                    subtotal
                );
            }
        }

        eligible.push({
            _id:            c._id,
            code:           c.code,
            description:    c.description,
            discountType:   c.discountType,
            discountValue:  c.discountValue,
            maxDiscount:    c.maxDiscount,
            minOrderAmount: c.minOrderAmount,
            eligibility:    c.eligibility,
            expiresAt:      c.expiresAt,
            categoryId:     c.categoryId  || null,
            applyScope:     c.applyScope  || 'cart',
            minProductQty:  c.minProductQty || 0,
            discountLabel,
            saving,
            applicable:     subtotal >= c.minOrderAmount,
        });
    }

    
    eligible.sort((a, b) => {
        if (a.applicable !== b.applicable) return b.applicable - a.applicable;
        return b.saving - a.saving;
    });

    return eligible;
}


export const getCouponsPage = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    try {
        const coupons = await getEligibleCoupons(req.session.user.id, 0);

        res.render('user/coupons', {
            title:      'My Coupons',
            coupons,
            activePage: 'coupons',
            error:   req.query.error   || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error('getCouponsPage error:', err.message);
        res.redirect('/profile?error=Failed+to+load+coupons');
    }
};


export const applyCoupon = async (req, res) => {
    if (!req.session?.user?.id)
        return res.status(401).json({ success: false, message: 'Please log in.' });

    const { code, subtotal, appliedOfferDiscount = 0 } = req.body;
    if (!code)
        return res.json({ success: false, message: 'Please enter a coupon code.' });

    const sub    = parseFloat(subtotal) || 0;
    const userId = req.session.user.id;

    try {
        
        const { default: User } = await import('../../models/Users.js');
        const user = await User.findById(userId).select('isBlocked').lean();
        if (user?.isBlocked)
            return res.json({ success: false, message: 'Your account is blocked. Coupons cannot be applied.' });

        const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true });

        if (!coupon)
            return res.json({ success: false, message: 'Invalid or expired coupon code.' });

       
        if (coupon.expiresAt && new Date() > coupon.expiresAt)
            return res.json({ success: false, message: 'This coupon has expired.' });

        
        if (coupon.usageLimitTotal !== null && coupon.usedCount >= coupon.usageLimitTotal)
            return res.json({ success: false, message: 'This coupon has reached its global usage limit.' });

        
        const userEntry = (coupon.usedBy || []).find(u => u.userId?.toString() === userId.toString());
        if (userEntry && userEntry.count >= coupon.usageLimitPerUser)
            return res.json({ success: false, message: `You have already used this coupon the maximum allowed times (${coupon.usageLimitPerUser}).` });

        
        if (coupon.eligibility === 'new_user') {
            const prevOrders = await Order.countDocuments({
                userId, status: { $in: ['delivered', 'return_requested', 'returned'] },
            });
            if (prevOrders > 0)
                return res.json({ success: false, message: 'This coupon is for new customers only.' });
        }

        if(coupon.eligibility==='referred'){
            const currentUser=await User.findById(userId);
            if(currentUser.referredBy===null){
                return res.json({ success: false, message: 'This coupon is for reffered customers only.' });
            }
        }

       
        if (coupon.eligibility === 'loyal') {
            const prevOrders = await Order.countDocuments({
                userId, status: { $in: ['delivered', 'return_requested', 'returned'] },
            });
            if (prevOrders < coupon.loyaltyThreshold)
                return res.json({
                    success: false,
                    message: `This coupon requires at least ${coupon.loyaltyThreshold} completed orders. You have ${prevOrders}.`,
                });
        }

        
        if (sub < coupon.minOrderAmount)
            return res.json({
                success: false,
                message: `This coupon requires a minimum cart value of $${coupon.minOrderAmount}. Add $${(coupon.minOrderAmount - sub).toFixed(2)} more.`,
            });

        
        const offerDiscount = parseFloat(appliedOfferDiscount) || 0;
        if (offerDiscount > 0 && !coupon.allowDoubleDiscount)
            return res.json({
                success: false,
                message: `This coupon cannot be combined with an active offer ($${offerDiscount.toFixed(2)} offer already applied). Use a coupon with "Allow Dip" enabled, or remove the discounted item.`,
            });

        
        const cartItems = Array.isArray(req.body.cartItems) ? req.body.cartItems : [];
        let baseAmount  = sub; 

        if (coupon.categoryId) {
            const catId   = coupon.categoryId.toString();
            const matched = cartItems.filter(i => i.categoryId && i.categoryId.toString() === catId);

            if (matched.length === 0)
                return res.json({
                    success: false,
                    message: 'This coupon is only valid for a specific category not present in your cart.',
                });

            
            const matchedQty = matched.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
            if (coupon.minProductQty > 0 && matchedQty < coupon.minProductQty)
                return res.json({
                    success: false,
                    message: `This coupon requires at least ${coupon.minProductQty} unit(s) of the qualifying product in your cart (you have ${matchedQty}).`,
                });

            
            if (coupon.applyScope === 'product') {
                baseAmount = +matched.reduce((s, i) => s + (parseFloat(i.lineTotal) || 0), 0).toFixed(2);
            }
        }

        
        let discount = 0;
        if (coupon.discountType === 'flat') {
            discount = Math.min(coupon.discountValue, baseAmount);
        } else {
            discount = +(baseAmount * coupon.discountValue / 100).toFixed(2);
            if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
            discount = Math.min(discount, baseAmount);
        }
        discount = +discount.toFixed(2);

        return res.json({
            success:      true,
            discount,
            couponId:     coupon._id,
            code:         coupon.code,
            discountType: coupon.discountType,
            applyScope:   coupon.applyScope || 'cart',
            message:      `Coupon applied! You save $${discount.toFixed(2)}.`,
        });

    } catch (err) {
        console.error('applyCoupon error:', err);
        return res.json({ success: false, message: 'Something went wrong. Please try again.' });
    }
};


export async function recordCouponUsage(couponId, userId) {
    if (!couponId) return;
    const coupon = await Coupon.findById(couponId);
    if (!coupon) return;

    coupon.usedCount += 1;
    
    if (!coupon.usedBy) coupon.usedBy = [];

    const entry = coupon.usedBy.find(u => u.userId && u.userId.toString() === userId.toString());
    if (entry) {
        entry.count += 1;
    } else {
        coupon.usedBy.push({ userId, count: 1 });
    }
    await coupon.save();
}



export const getCouponStatus = async (req, res) => {
    const codes = (req.query.codes || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    if (!codes.length) return res.json({ statuses: {} });
    try {
        const coupons = await Coupon.find({ code: { $in: codes } }).select('code isActive expiresAt usageLimitTotal usedCount').lean();
        const now = new Date();
        const statuses = {};
        for (const c of coupons) {
            const expired   = c.expiresAt && c.expiresAt < now;
            const limitHit  = c.usageLimitTotal !== null && c.usedCount >= c.usageLimitTotal;
            statuses[c.code] = c.isActive && !expired && !limitHit ? 'active' : 'inactive';
        }
        return res.json({ statuses });
    } catch (err) {
        return res.json({ statuses: {} });
    }
};

export async function refundCouponUsage(couponId, userId) {
    if (!couponId) return;
    try {
        const coupon = await Coupon.findById(couponId);
        if (!coupon) return;

        if (coupon.usedCount > 0) coupon.usedCount -= 1;

        const entry = (coupon.usedBy || []).find(u => u.userId?.toString() === userId.toString());
        if (entry && entry.count > 0) {
            entry.count -= 1;
            
            if (entry.count === 0) {
                coupon.usedBy = coupon.usedBy.filter(u => u.userId?.toString() !== userId.toString());
            }
        }
        await coupon.save();
    } catch (err) {
        console.error('refundCouponUsage error (non-fatal):', err.message);
    }
}