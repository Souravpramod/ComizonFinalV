import Product  from '../../models/Product.js';
import Offer    from '../../models/Offer.js';
import { getBestOfferForProduct } from '../../controllers/admin/offerController.js';

export const getPriceCheck = async (req, res) => {
    try {
        const ids = (req.query.ids || '').split(',').filter(Boolean);
        if (ids.length === 0) return res.json({ ok: true, products: [] });

        const products = await Product.find({ _id: { $in: ids } })
            .select('price categoryId isActive outOfstock isPremium')
            .lean();

        const results = await Promise.all(products.map(async (p) => {
            const offer = await getBestOfferForProduct(p._id, p.categoryId, p.price);
            return {
                _id:            p._id.toString(),
                originalPrice:  p.price,
                effectivePrice: offer ? offer.effectivePrice : p.price,
                hasOffer:       !!offer,
                offerBadge:     offer
                                  ? (offer.discountType === 'flat'
                                      ? `$${offer.discountValue} OFF`
                                      : `${offer.discountValue}% OFF`)
                                  : null,
                badgeColor:     offer?.badgeColorListing || '#E63946',
                isActive:       p.isActive,
                outOfstock:     p.outOfstock,
                isPremium:      !!p.isPremium,
            };
        }));

        return res.json({ ok: true, products: results });
    } catch (err) {
        console.error('getPriceCheck error:', err.message);
        return res.status(500).json({ ok: false });
    }
};
