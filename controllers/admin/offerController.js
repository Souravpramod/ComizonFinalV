
import Offer    from '../../models/Offer.js';
import Product  from '../../models/Product.js';
import Category from '../../models/Category.js';

const ITEMS_PER_PAGE = 10;

export const getOffers = async (req, res) => {
    const { search = '', offerType = '', status = '', page = 1 } = req.query;
    const currentPage = Number(page);

    try {
        const query = {};
        if (search) {
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.title = { $regex: `.*${safe}.*`, $options: 'i' };
            
        }
        if (offerType) query.offerType = offerType;
        if (status === 'active')   query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        const totalOffers = await Offer.countDocuments(query);
        const offers = await Offer.find(query)
            .populate('productIds',  'productName')
            .populate('categoryIds', 'categoryName')
            .sort({ createdAt: -1 })
            .skip((currentPage - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE)
            .lean();

        const now = new Date();
        offers.forEach(o => {
            o.liveStatus =
                !o.isActive ? 'Inactive' :
                (o.startsAt  && now < new Date(o.startsAt))  ? 'Scheduled' :
                (o.expiresAt && now > new Date(o.expiresAt)) ? 'Expired'   : 'Active';
        });

        const [products, categories] = await Promise.all([
            Product.find({ isActive: true }).select('productName').lean(),
            Category.find({ isActive: true }).select('categoryName').lean(),
        ]);

        res.render('admin/offers/index', {
            title: 'Offer Management',
            offers, totalOffers,
            totalPages: Math.ceil(totalOffers / ITEMS_PER_PAGE) || 1,
            currentPage, search, offerType, status,
            products, categories,
            error: req.query.error || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error('getOffers error:', err.message);
        res.render('admin/offers/index', {
            title: 'Offer Management',
            offers: [], totalOffers: 0, totalPages: 1, currentPage: 1,
            search: '', offerType: '', status: '',
            products: [], categories: [],
            error: 'Failed to load offers', success: null,
        });
    }
};

export const createOffer = async (req, res) => {
    const { title, offerType, productIds, categoryIds,
            discountType, discountValue, maxDiscount,
            referralReward, startsAt, expiresAt,
            badgeColorListing, badgeColorDetail } = req.body;
 

    const fail = (msg) => res.status(400).json({ ok: false, message: msg });
 
    const errors   = [];
    const warnings = [];
 

    const cleanTitle = (title || '').trim().replace(/<[^>]*>/g, '');
    if (!cleanTitle || cleanTitle.length < 3)
        errors.push('Title must be at least 3 characters.');
    if (cleanTitle.length > 100)
        errors.push('Title must be under 100 characters.');
 
    if (!['product','category','referral'].includes(offerType))
        errors.push('Invalid offer type.');
 
    if (!['flat','percent'].includes(discountType))
        errors.push('Invalid discount type.');
 
    const dv = parseFloat(discountValue);
    if (isNaN(dv) || dv < 0)
        errors.push('Discount value must be a non-negative number.');
    if (discountType === 'percent' && dv >= 100)
        errors.push('Percentage discount must be less than 100% (max 99%).');
    if (discountType === 'flat' && dv <= 0)
        errors.push('Flat discount value must be greater than 0.');
 
    const maxDisc = maxDiscount ? parseFloat(maxDiscount) : null;
    if (maxDisc !== null && maxDisc <= 0)
        errors.push('Max discount cap must be a positive number.');
 
    if (offerType === 'referral') {
        const reward = parseFloat(referralReward) || 0;
        if (reward < 0) errors.push('Referral reward cannot be negative.');
        if (reward > 100) errors.push('Referral reward cannot exceed $10 to prevent system abuse.');
    }
 

    const now = new Date();
    const start  = startsAt  ? new Date(startsAt)  : null;
    const expiry = expiresAt ? new Date(expiresAt) : null;
 
    if (expiry && expiry <= now)
        errors.push('Expiry date must be in the future.');
    if (start && expiry && start >= expiry)
        errors.push('Start date must be strictly before expiry date.');
    if (start && expiry && (expiry - start) < 60 * 60 * 1000)
        errors.push('Offer duration must be at least 1 hour to avoid checkout race conditions.');
 

    const pIds = productIds  ? (Array.isArray(productIds)  ? productIds  : [productIds])  : [];
    const cIds = categoryIds ? (Array.isArray(categoryIds) ? categoryIds : [categoryIds]) : [];
 
    if (offerType === 'product'  && pIds.length === 0)
        errors.push('Select at least one product for a product offer.');
    if (offerType === 'category' && cIds.length === 0)
        errors.push('Select at least one category for a category offer.');
 

    if (errors.length) return fail(errors.join(' | '));
 
    try {

        const dupTitle = await Offer.findOne({ title: cleanTitle });
        if (dupTitle)
            return fail('An offer with this title already exists. Use a unique, descriptive title (e.g. "Summer Sale 2025").');
 

        if (offerType === 'product' && pIds.length > 0) {
            const products = await Product.find({ _id: { $in: pIds } }).lean();
 
            const inactive = products.filter(p => !p.isActive).map(p => p.productName);
            if (inactive.length)
                return fail(`These products are inactive and cannot receive offers: ${inactive.join(', ')}`);
 
            if (discountType === 'flat') {
                const cheapest = Math.min(...products.map(p => p.price));
                if (dv >= cheapest)
                    return fail(`Flat discount ($${dv}) must be less than the cheapest selected product price ($${cheapest}). A discount cannot make a product free or negative.`);
            }
 
            const outOfStock = products.filter(p => p.outOfstock).map(p => p.productName);
            if (outOfStock.length)
                warnings.push(`Note: These products are currently out of stock: ${outOfStock.join(', ')}.`);
 
            const conflictingOffers = await Offer.find({
                isActive:   true,
                offerType:  'product',
                productIds: { $in: pIds },
            }).lean();
            if (conflictingOffers.length) {
                const conflictTitles = conflictingOffers.map(o => o.title).join(', ');
                return fail(`One or more selected products already belong to an active product offer: "${conflictTitles}". Deactivate that offer first.`);
            }
 
            const productDocs    = await Product.find({ _id: { $in: pIds } }).select('categoryId').lean();
            const catIdsOfProds  = productDocs.map(p => p.categoryId.toString());
            const overlapCatOffer = await Offer.findOne({
                isActive:    true,
                offerType:   'category',
                categoryIds: { $in: catIdsOfProds },
            }).lean();
            if (overlapCatOffer)
                warnings.push(`Warning: Some selected products are already covered by an active category offer "${overlapCatOffer.title}". The best discount will be auto-applied.`);
        }
 

        if (offerType === 'category' && cIds.length > 0) {
            const categories = await Category.find({ _id: { $in: cIds } }).lean();
 
            const inactive = categories.filter(c => !c.isActive).map(c => c.categoryName);
            if (inactive.length)
                return fail(`These categories are inactive: ${inactive.join(', ')}`);
 
            if (discountType === 'flat') {
                const cheapestProd = await Product.findOne({
                    categoryId: { $in: cIds },
                    isActive:   true,
                }).sort({ price: 1 }).lean();
                if (cheapestProd && dv >= cheapestProd.price)
                    return fail(`Flat discount ($${dv}) must be less than the cheapest active product in these categories ($${cheapestProd.price} — "${cheapestProd.productName}").`);
            }
        }
 
   
        await Offer.create({
            title:             cleanTitle,
            badgeColorListing: badgeColorListing || '#E63946',
            badgeColorDetail:  badgeColorDetail  || '#E63946',
            offerType,
            productIds:     offerType === 'product'  ? pIds : [],
            categoryIds:    offerType === 'category' ? cIds : [],
            discountType,
            discountValue:  dv,
            maxDiscount:    maxDisc,
            referralReward: offerType === 'referral' ? (parseFloat(referralReward) || 0) : 0,
            startsAt:  start  || null,
            expiresAt: expiry || null,
            isActive: true,
        });
 
        const successMsg = warnings.length
            ? `Offer created successfully. ${warnings.join(' ')}`
            : 'Offer created successfully';
 
        
        return res.json({ ok: true, message: successMsg });
 
    } catch (err) {
        console.error('createOffer error:', err.message);
        return fail('Failed: ' + err.message);
    }
};

export const updateOffer = async (req, res) => {
    const { id } = req.params;
    const { title, offerType, productIds, categoryIds,
            discountType, discountValue, maxDiscount,
            referralReward, startsAt, expiresAt,
            badgeColorListing, badgeColorDetail } = req.body;
 
    const fail = (msg) => res.status(400).json({ ok: false, message: msg });
 
    const errors   = [];
    const warnings = [];
 
    const cleanTitle = (title || '').trim().replace(/<[^>]*>/g, '');
    if (!cleanTitle || cleanTitle.length < 3) errors.push('Title must be at least 3 characters.');
    if (cleanTitle.length > 100)              errors.push('Title must be under 100 characters.');
 
    if (!['product','category','referral'].includes(offerType)) errors.push('Invalid offer type.');
    if (!['flat','percent'].includes(discountType))             errors.push('Invalid discount type.');
 
    const dv = parseFloat(discountValue);
    if (isNaN(dv) || dv < 0)                          errors.push('Discount value must be a non-negative number.');
    if (discountType === 'percent' && dv >= 100)       errors.push('Percentage discount must be less than 100%.');
    if (discountType === 'flat'    && dv <= 0)         errors.push('Flat discount value must be greater than 0.');
 
    const maxDisc = maxDiscount ? parseFloat(maxDiscount) : null;
    if (maxDisc !== null && maxDisc <= 0) errors.push('Max discount cap must be a positive number.');
 
    if (offerType === 'referral') {
        const reward = parseFloat(referralReward) || 0;
        if (reward < 0)   errors.push('Referral reward cannot be negative.');
        if (reward > 100) errors.push('Referral reward cannot exceed $10 to prevent system abuse.');
    }
 
    const now    = new Date();
    const start  = startsAt  ? new Date(startsAt)  : null;
    const expiry = expiresAt ? new Date(expiresAt) : null;
 
    if (expiry && expiry <= now)                               errors.push('Expiry date must be in the future.');
    if (start && expiry && start >= expiry)                    errors.push('Start date must be strictly before expiry date.');
    if (start && expiry && (expiry - start) < 60 * 60 * 1000) errors.push('Offer duration must be at least 1 hour.');
 
    const pIds = productIds  ? (Array.isArray(productIds)  ? productIds  : [productIds])  : [];
    const cIds = categoryIds ? (Array.isArray(categoryIds) ? categoryIds : [categoryIds]) : [];
 
    if (offerType === 'product'  && pIds.length === 0) errors.push('Select at least one product.');
    if (offerType === 'category' && cIds.length === 0) errors.push('Select at least one category.');
 
    if (errors.length) return fail(errors.join(' | '));
 
    try {
        const offer = await Offer.findById(id);
        if (!offer) return fail('Offer not found.');
 

        const dupTitle = await Offer.findOne({ title: cleanTitle, _id: { $ne: id } });
        if (dupTitle) return fail('An offer with this title already exists.');
 
        if (offerType === 'product' && pIds.length > 0) {
            const products = await Product.find({ _id: { $in: pIds } }).lean();
            const inactive = products.filter(p => !p.isActive).map(p => p.productName);
            if (inactive.length) return fail(`Inactive products cannot receive offers: ${inactive.join(', ')}`);
 
            if (discountType === 'flat') {
                const cheapest = Math.min(...products.map(p => p.price));
                if (dv >= cheapest) return fail(`Flat discount must be less than cheapest product price ($${cheapest}).`);
            }
 
            const outOfStock = products.filter(p => p.outOfstock).map(p => p.productName);
            if (outOfStock.length) warnings.push(`Note: Out of stock: ${outOfStock.join(', ')}.`);
 

            const conflicting = await Offer.find({
                isActive: true, offerType: 'product',
                productIds: { $in: pIds }, _id: { $ne: id },
            }).lean();
            if (conflicting.length)
                return fail(`Products already in active offer: "${conflicting.map(o => o.title).join(', ')}". Deactivate first.`);
        }
 
        if (offerType === 'category' && cIds.length > 0) {
            const categories = await Category.find({ _id: { $in: cIds } }).lean();
            const inactive   = categories.filter(c => !c.isActive).map(c => c.categoryName);
            if (inactive.length) return fail(`Inactive categories: ${inactive.join(', ')}`);
 
            if (discountType === 'flat') {
                const cheapestProd = await Product.findOne({ categoryId: { $in: cIds }, isActive: true })
                    .sort({ price: 1 }).lean();
                if (cheapestProd && dv >= cheapestProd.price)
                    return fail(`Flat discount must be less than cheapest product in categories ($${cheapestProd.price} — "${cheapestProd.productName}").`);
            }
        }
 
        await Offer.findByIdAndUpdate(id, {
            title:             cleanTitle,
            badgeColorListing: badgeColorListing || '#E63946',
            badgeColorDetail:  badgeColorDetail  || '#E63946',
            offerType,
            productIds:     offerType === 'product'  ? pIds : [],
            categoryIds:    offerType === 'category' ? cIds : [],
            discountType,
            discountValue:  dv,
            maxDiscount:    maxDisc,
            referralReward: offerType === 'referral' ? (parseFloat(referralReward) || 0) : 0,
            startsAt:  start  || null,
            expiresAt: expiry || null,
        });
 
        const msg = warnings.length ? `Offer updated. ${warnings.join(' ')}` : 'Offer updated successfully';
        return res.json({ ok: true, message: msg });
 
    } catch (err) {
        console.error('updateOffer error:', err.message);
        return fail('Failed: ' + err.message);
    }
};

export const toggleOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ ok: false, message: 'Offer not found' });


        if (!offer.isActive && offer.expiresAt && new Date(offer.expiresAt) <= new Date()) {
            return res.status(400).json({
                ok:      false,
                message: 'Cannot activate — this offer has already expired. Update the expiry date first.',
            });
        }

        offer.isActive = !offer.isActive;
        await offer.save();
        return res.json({ ok: true, isActive: offer.isActive });
    } catch (err) {
        return res.status(500).json({ ok: false, message: err.message });
    }
};

export const deleteOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ ok: false, message: 'Offer not found' });

     
        if (offer.isActive) {
            return res.status(400).json({
                ok:      false,
                message: 'Cannot delete an active offer. Deactivate it first.',
            });
        }

        await Offer.findByIdAndDelete(req.params.id);
        return res.json({ ok: true, message: 'Offer deleted' });
    } catch (err) {
        console.error('deleteOffer error:', err.message);
        return res.status(500).json({ ok: false, message: err.message });
    }
};


export async function getBestOfferForProduct(productId, categoryId, originalPrice) {
    const now = new Date();
    const offers = await Offer.find({
        isActive:  true,
        offerType: { $in: ['product', 'category'] },
    }).lean();

    let bestDiscount      = 0;
    let bestLabel         = '';
    let bestColorListing  = '#E63946';
    let bestColorDetail   = '#E63946';
    let bestDiscountType  = 'percent';
    let bestDiscountValue = 0;

    for (const o of offers) {
        if (o.startsAt  && now < new Date(o.startsAt))  continue;
        if (o.expiresAt && now > new Date(o.expiresAt)) continue;

        let applicable = false;
        if (o.offerType === 'product')
            applicable = o.productIds.some(id => id.toString() === productId.toString());
        else if (o.offerType === 'category')
            applicable = o.categoryIds.some(id => id.toString() === categoryId.toString());

        if (!applicable) continue;

        let discount = 0;
        if (o.discountType === 'flat') {
            discount = Math.min(o.discountValue, originalPrice);
        } else {
            discount = +(originalPrice * o.discountValue / 100).toFixed(2);
            if (o.maxDiscount) discount = Math.min(discount, o.maxDiscount);
            discount = Math.min(discount, originalPrice);
        }

        if (discount > bestDiscount) {
            bestDiscount     = discount;
            bestLabel        = o.title;
            bestColorListing = o.badgeColorListing || '#E63946';
            bestColorDetail  = o.badgeColorDetail  || '#E63946';
            bestDiscountType = o.discountType;
            bestDiscountValue = o.discountValue;
        }
    }

    if (bestDiscount === 0) return null;
    return {
        discount:         +bestDiscount.toFixed(2),
        effectivePrice:   +(originalPrice - bestDiscount).toFixed(2),
        offerLabel:       bestLabel,
        badgeColorListing: bestColorListing,
        badgeColorDetail:  bestColorDetail,
        discountType:      bestDiscountType,
        discountValue:     bestDiscountValue,
    };
}



export const searchProductsApi = async (req, res) => {
    try {
        const query = req.query.q;
      
        const products = await Product.find({
            productName: { $regex: query, $options: 'i' },
            isActive: true
        }).select('productName price').limit(10);
        
        res.json(products);
    } catch (err) {
        res.status(500).json([]);
    }
};