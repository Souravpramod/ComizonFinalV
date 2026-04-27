import Product from '../../models/Product.js';
import PageSetting from '../../models/PageSetting.js';
import Wishlist from '../../models/Wishlist.js';

export async function renderListingPage(req, res, pageName, viewName, heroImage) {

    const { page = 1, category = 'all', sort = 'featured', search = '', minPrice = 0, maxPrice = 1000 } = req.query;

    const isAjax = req.query.ajax === '1';

    const limit = 9;
    const currentPage = Number(page) || 1;

    try {

        const setting = await PageSetting
            .findOne({ page: pageName })
            .populate('categories')
            .lean();

        const categories = (setting?.categories || []).filter(c => c.isActive);
        const catIds = categories.map(c => c._id);

        const query = {
            categoryId: { $in: catIds },
            isActive: { $ne: false },
            outOfstock: false,
            price: {
                $gte: Number(minPrice),
                $lte: Number(maxPrice)
            }
        };

        if (category !== 'all') {
            const match = categories.find(c => c._id.toString() === category);
            if (match) query.categoryId = match._id;
        }

        if (search.trim()) {
            const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            query.$or = [
                { productName: { $regex: safe, $options: 'i' } },
                { author: { $regex: safe, $options: 'i' } },
                { publisher: { $regex: safe, $options: 'i' } }
            ];
        }

        const sortOption =
            sort === 'az' ? { productName: 1 } :
            sort === 'za' ? { productName: -1 } :
            sort === 'low' ? { price: 1 } :
            sort === 'high' ? { price: -1 } :
            { isPremium: -1, createdAt: -1 };

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit) || 1;

        const dbProducts = await Product.find(query)
            .populate('categoryId', 'categoryName')
            .sort(sortOption)
            .skip((currentPage - 1) * limit)
            .limit(limit)
            .lean();

        const products = dbProducts.map(p => ({
            _id: p._id.toString(),
            name: p.productName,
            images: p.images || [],
            image: (p.images && p.images.length > 0)
                ? p.images[0]
                : 'https://placehold.co/300x450/1a1a1a/E63946?text=No+Image',
            category: p.categoryId?.categoryName || '',
            categoryId: p.categoryId?._id, 
            price: p.price,
            badge: p.isPremium ? 'PREMIUM' :
                (p.stockQuantity > 0 && p.stockQuantity <= 5 ? 'HOT' : null),
            rating: p.reviewStat?.averageRating || 0,
            reviews: p.reviewStat?.totalReviews || 0
        }));

       
        const { getBestOfferForProduct } = await import('../admin/offerController.js');
        const productsWithOffers = await Promise.all(products.map(async (p) => {
            const offerResult = await getBestOfferForProduct(p._id, p.categoryId, p.price);
            return {
                ...p,
                effectivePrice:    offerResult?.effectivePrice    ?? p.price,
                offerBadge:        offerResult
                                    ? (offerResult.discountType === 'flat'
                                        ? `₹${offerResult.discountValue} OFF`
                                        : `${offerResult.discountValue}% OFF`)
                                    : null,
                badgeColorListing: offerResult?.badgeColorListing ?? '#E63946',
            };
        }));

    
        let wishlistIds = [];
        if (req.session?.user?.id) {
            const wishlist = await Wishlist.findOne({ userId: req.session.user.id }).lean();
            wishlistIds = (wishlist?.products || []).map(w => w.productId.toString());
        }

        if (isAjax) {
            return res.json({
                products: productsWithOffers,
                totalProducts,
                totalPages,
                currentPage,
                activeCategory: category,
                sort,
                search,
                minPrice,
                maxPrice,
                wishlistIds
            });
        }

        res.render(viewName, {
            title: pageName.charAt(0).toUpperCase() + pageName.slice(1),
            products: productsWithOffers,
            totalProducts,
            totalPages,
            currentPage,
            activeCategory: category,
            sort,
            search,
            dbCategories: categories,
            heroImage,
            minPrice,
            maxPrice,
            wishlistIds
        });

    } catch (err) {

        console.error(pageName + ' page error:', err.message);

        res.render(viewName, {
            title: pageName,
            products: [],
            totalProducts: 0,
            totalPages: 1,
            currentPage: 1,
            activeCategory: category,
            sort,
            search,
            dbCategories: [],
            heroImage
        });

    }

}





