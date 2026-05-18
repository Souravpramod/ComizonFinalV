
import Coupon   from '../../models/Coupon.js';
import Category from '../../models/Category.js';  

const ITEMS_PER_PAGE = 10;

export const getCoupons = async (req, res) => {
    const { search = '', status = '', page = 1 } = req.query;
    const currentPage = Number(page);

    try {
        const categories = await Category.find({ isActive: true }).select('categoryName').lean();
        const query = {};
        if (search) {
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { code:        { $regex: safe, $options: 'i' } },
                { description: { $regex: safe, $options: 'i' } },
            ];
        }
        if (status === 'active')   query.isActive = true;
        if (status === 'inactive') query.isActive = false;
        if (status === 'expired')  { query.expiresAt = { $lt: new Date() }; }

        const totalCoupons = await Coupon.countDocuments(query);
        const coupons = await Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip((currentPage - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE)
            .lean();

        res.render('admin/coupons/index', {
            title: 'Coupon Management',
            coupons, totalCoupons,
            totalPages: Math.ceil(totalCoupons / ITEMS_PER_PAGE) || 1,
            currentPage, search, status,
            categories,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error('getCoupons error:', err.message);
        res.render('admin/coupons/index', {
            title: 'Coupon Management',
            coupons: [], totalCoupons: 0, totalPages: 1, currentPage: 1,
            search: '', status: '', categories: [], error: 'Failed to load coupons', success: null,
        });
    }
};

export const createCoupon = async (req, res) => {
    const { code, description, discountType, discountValue, maxDiscount,
            minOrderAmount, eligibility, loyaltyThreshold,
            usageLimitTotal, usageLimitPerUser, expiresAt,
            allowDoubleDiscount, categoryId, applyScope, minProductQty } = req.body;

    const errors = [];

   
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3)
        errors.push('Coupon code must be at least 3 characters.');
    if (cleanCode.length > 20)
        errors.push('Coupon code must be 20 characters or fewer.');
    if (!/^[A-Z0-9_-]+$/.test(cleanCode))
        errors.push('Code may only contain letters, numbers, hyphens, and underscores.');

    
    if (!['flat','percent'].includes(discountType))
        errors.push('Invalid discount type.');

    const dv = parseFloat(discountValue);
    if (isNaN(dv) || dv <= 0)
        errors.push('Discount value must be a positive number.');
    if (discountType === 'percent' && dv >= 100)
        errors.push('Percentage discount must be less than 100%.');

    const maxDisc = maxDiscount ? parseFloat(maxDiscount) : null;
    if (discountType === 'percent' && !maxDisc)
        errors.push('Percentage coupons require a Max Discount Cap.');
    if (maxDisc !== null && maxDisc <= 0)
        errors.push('Max discount cap must be a positive number.');

    
    const minAmt = discountType === 'percent' ? 0 : (parseFloat(minOrderAmount) || 0);
    if (minAmt < 0)
        errors.push('Min order amount cannot be negative.');
    if (discountType === 'flat' && dv > 0 && minAmt > 0 && dv >= minAmt)
        errors.push(`Flat discount ($${dv}) cannot exceed or equal the minimum order amount ($${minAmt}).`);

   
    const perUserLimit = parseInt(usageLimitPerUser) || 1;
    const totalLimit   = usageLimitTotal ? parseInt(usageLimitTotal) : null;
    if (perUserLimit < 1)
        errors.push('Per-user limit must be at least 1.');
    if (totalLimit !== null && totalLimit < 1)
        errors.push('Total usage limit must be a positive integer.');
    if (totalLimit !== null && perUserLimit > totalLimit)
        errors.push('Per-user limit cannot exceed the total usage limit.');

    
    const loyaltyThr = parseInt(loyaltyThreshold) || 5;
    if (eligibility === 'loyal' && loyaltyThr < 1)
        errors.push('Loyalty threshold must be at least 1 completed order.');
    

  
    if (expiresAt && new Date(expiresAt) <= new Date())
        errors.push('Expiry date must be in the future.');

  
    if (errors.length)
        return res.status(400).json({ ok: false, errors });
    
    if (req.body._validateOnly === '1')
        return res.json({ ok: true });

    try {
        const existing = await Coupon.findOne({ code: cleanCode });
        if (existing)
            return res.status(400).json({ ok: false, errors: ['A coupon with this code already exists.'] });
            console.log(cleanCode);
        await Coupon.create({
            code:                cleanCode,
            description:         (description || '').trim(),
            discountType,
            discountValue:       dv,
            maxDiscount:         maxDisc,
            minOrderAmount:      minAmt,
            eligibility:         eligibility || 'all',
            loyaltyThreshold:    loyaltyThr,
            usageLimitTotal:     totalLimit,
            usageLimitPerUser:   perUserLimit,
            expiresAt:           expiresAt ? new Date(expiresAt) : null,
            allowDoubleDiscount: allowDoubleDiscount === 'on' || allowDoubleDiscount === 'true',
            categoryId:          categoryId || null,
            applyScope:          applyScope === 'product' ? 'product' : 'cart',
            minProductQty:       parseInt(minProductQty) || 0,
            isActive:            true,
        });

        return res.json({ ok: true });
    } catch (err) {
        console.error('createCoupon error:', err.message);
        return res.status(500).json({ ok: false, errors: ['Server error: ' + err.message] });
    }
};


export const updateCoupon = async (req, res) => {
    const { id } = req.params;
    const { code, description, discountType, discountValue, maxDiscount,
            minOrderAmount, eligibility, loyaltyThreshold,
            usageLimitTotal, usageLimitPerUser, expiresAt,
            allowDoubleDiscount, categoryId, applyScope, minProductQty } = req.body;
 
    const errors = [];
 
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) errors.push('Coupon code must be at least 3 characters.');
    if (cleanCode.length > 20)              errors.push('Coupon code must be 20 characters or fewer.');
    if (!/^[A-Z0-9_-]+$/.test(cleanCode))  errors.push('Code may only contain letters, numbers, hyphens, and underscores.');
 
    if (!['flat','percent'].includes(discountType)) errors.push('Invalid discount type.');
 
    const dv = parseFloat(discountValue);
    if (isNaN(dv) || dv <= 0)                    errors.push('Discount value must be a positive number.');
    if (discountType === 'percent' && dv >= 100)  errors.push('Percentage discount must be less than 100%.');
 
    const maxDisc = maxDiscount ? parseFloat(maxDiscount) : null;
    if (discountType === 'percent' && !maxDisc)   errors.push('Percentage coupons require a Max Discount Cap.');
    if (maxDisc !== null && maxDisc <= 0)         errors.push('Max discount cap must be a positive number.');
 
    const minAmt = parseFloat(minOrderAmount) || 0;
    if (minAmt < 0) errors.push('Min order amount cannot be negative.');
    if (discountType === 'flat' && dv > 0 && minAmt > 0 && dv >= minAmt)
        errors.push(`Flat discount ($${dv}) cannot be ≥ minimum order amount ($${minAmt}).`);
 
    const perUserLimit = parseInt(usageLimitPerUser) || 1;
    const totalLimit   = usageLimitTotal ? parseInt(usageLimitTotal) : null;
    if (perUserLimit < 1) errors.push('Per-user limit must be at least 1.');
    if (totalLimit !== null && totalLimit < 1)         errors.push('Total usage limit must be a positive integer.');
    if (totalLimit !== null && perUserLimit > totalLimit) errors.push('Per-user limit cannot exceed the total usage limit.');
 
    const loyaltyThr = parseInt(loyaltyThreshold) || 5;
    if (eligibility === 'loyal' && loyaltyThr < 1) errors.push('Loyalty threshold must be at least 1 completed order.');
 
    if (expiresAt && new Date(expiresAt) <= new Date()) errors.push('Expiry date must be in the future.');
 
    if (errors.length) return res.status(400).json({ ok: false, errors });
 
    try {
        const coupon = await Coupon.findById(id);
        if (!coupon) return res.status(404).json({ ok: false, errors: ['Coupon not found.'] });
 
        
        const existing = await Coupon.findOne({ code: cleanCode, _id: { $ne: id } });
        if (existing) return res.status(400).json({ ok: false, errors: ['A coupon with this code already exists.'] });
 
        await Coupon.findByIdAndUpdate(id, {
            code:                cleanCode,
            description:         (description || '').trim(),
            discountType,
            discountValue:       dv,
            maxDiscount:         maxDisc,
            minOrderAmount:      minAmt,
            eligibility:         eligibility || 'all',
            loyaltyThreshold:    loyaltyThr,
            usageLimitTotal:     totalLimit,
            usageLimitPerUser:   perUserLimit,
            expiresAt:           expiresAt ? new Date(expiresAt) : null,
            allowDoubleDiscount: allowDoubleDiscount === 'on' || allowDoubleDiscount === 'true',
            categoryId:          categoryId || null,
            applyScope:          applyScope === 'product' ? 'product' : 'cart',
            minProductQty:       parseInt(minProductQty) || 0,
        });
 
        return res.json({ ok: true });
    } catch (err) {
        console.error('updateCoupon error:', err.message);
        return res.status(500).json({ ok: false, errors: ['Server error: ' + err.message] });
    }
};


export const toggleCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return res.status(404).json({ ok: false, message: 'Not found' });

       
        if (!coupon.isActive && coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) {
            return res.status(400).json({
                ok:      false,
                message: 'Cannot activate — this coupon has already expired. Update the expiry date first.',
            });
        }


        coupon.isActive = !coupon.isActive;
        await coupon.save();
        
        return res.json({ 
            ok: true, 
            isActive: coupon.isActive, 
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully.` 
        });
    } catch (err) {
        console.error('Toggle Coupon Error:', err);
        return res.status(500).json({ 
            ok: false, 
            message: 'Failed to update coupon status. ' + err.message 
        });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return res.status(404).json({ ok: false, message: 'Coupon not found' });
        if (coupon.usedCount > 0)
            return res.status(400).json({ ok: false, message: 'Cannot delete a used coupon. Deactivate it instead.' });
        await Coupon.findByIdAndDelete(req.params.id);
        return res.json({ ok: true, message: 'Coupon deleted successfully' });
    } catch (err) {
        return res.status(500).json({ ok: false, message: err.message });
    }
};



