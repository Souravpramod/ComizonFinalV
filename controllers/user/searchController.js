import Product from '../../models/Product.js';
import Category from '../../models/Category.js';
import Wishlist from '../../models/Wishlist.js';

export async function getSearch(req, res) {
    const {
        search = '',
        sort = 'featured',
        category = 'all',
        page = 1,
        minPrice = 0,
        maxPrice = 1000,
    } = req.query;

    const isAjax = req.query.ajax === '1';
    const limit = 9;
    const currentPage = Number(page) || 1;
    const searchTrim = search.trim();

    try {
        

        const allActiveCategories = await Category.find({ isActive: true, isPremium: { $ne: true } }).lean();

        
        let matchedCategoryIds = [];
        if (searchTrim) {
            const safe = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const catRegex = new RegExp(safe, 'i');
            matchedCategoryIds = allActiveCategories
                .filter(c => catRegex.test(c.categoryName))
                .map(c => c._id);
        }


const nonPremiumCatIds = allActiveCategories
    .filter(c => !c.isPremium && c.isActive)
    .map(c => c._id);

const query = {
    isActive:true,
    outOfstock: false,
    isPremium: false,
    categoryId: { $in: nonPremiumCatIds },
    price: {
        $gte: Number(minPrice),
        $lte: Number(maxPrice),
    },
};

  
        if (category !== 'all') {
            const isAllowed = nonPremiumCatIds.some(id => id.toString() === category);
            if (isAllowed) {
                query.categoryId = category;
            } else {
               
                query.categoryId = null;
            }
        }

        if (searchTrim) {
            const safe = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

           
            const nonPremiumCatIdStrings = new Set(nonPremiumCatIds.map(id => id.toString()));
            const safeCategoryIds = matchedCategoryIds
                .filter(id => nonPremiumCatIdStrings.has(id.toString()));

            query.$or = [
                { productName: { $regex: safe, $options: 'i' } },
                { author:      { $regex: safe, $options: 'i' } },
                { publisher:   { $regex: safe, $options: 'i' } },
                ...(safeCategoryIds.length
                    ? [{ categoryId: { $in: safeCategoryIds } }]
                    : []),
            ];
        }

        
        const sortOption =
            sort === 'az'   ? { productName: 1 } :
            sort === 'za'   ? { productName: -1 } :
            sort === 'low'  ? { price: 1 } :
            sort === 'high' ? { price: -1 } :
            { isPremium: -1, createdAt: -1 };

       
        const totalProducts = await Product.countDocuments(query);
        const totalPages    = Math.ceil(totalProducts / limit) || 1;

        const dbProducts = await Product.find(query)
            .populate('categoryId', 'categoryName')
            .sort(sortOption)
            .skip((currentPage - 1) * limit)
            .limit(limit)
            .lean();

        const products = dbProducts.map(p => ({
            _id:        p._id.toString(),
            name:       p.productName,
            images:     p.images || [],
            image:      (p.images && p.images.length > 0)
                            ? p.images[0]
                            : 'https://placehold.co/300x450/1a1a1a/E63946?text=No+Image',
            category:   p.categoryId?.categoryName || '',
            categoryId: p.categoryId?._id,
            price:      p.price,
            badge:      p.isPremium ? 'PREMIUM' :
                        (p.stockQuantity > 0 && p.stockQuantity <= 5 ? 'HOT' : null),
            rating:     p.reviewStat?.averageRating || 0,
            reviews:    p.reviewStat?.totalReviews  || 0,
        }));

        
        const { getBestOfferForProduct } = await import('../admin/offerController.js');
        const productsWithOffers = await Promise.all(products.map(async (p) => {
            const offerResult = await getBestOfferForProduct(p._id, p.categoryId, p.price);
            return {
                ...p,
                effectivePrice:    offerResult?.effectivePrice    ?? p.price,
                offerBadge:        offerResult
                                    ? (offerResult.discountType === 'flat'
                                        ? `$${offerResult.discountValue} OFF`
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

       
        const nonPremiumCatIdStringSet = new Set(nonPremiumCatIds.map(id => id.toString()));
        const productCategoryIds = new Set(
            dbProducts
                .map(p => p.categoryId?._id?.toString())
                .filter(id => id && nonPremiumCatIdStringSet.has(id))
        );

      
        const activeCatIdStrings = new Set(allActiveCategories.map(c => c._id.toString()));
        const matchedCatIdStrings = new Set(matchedCategoryIds.map(id => id.toString()));
        const relevantCategoryIds = new Set(
            [...matchedCatIdStrings, ...productCategoryIds]
                .filter(id => activeCatIdStrings.has(id))
        );


const dbCategories = allActiveCategories
    .filter(c => !c.isPremium && relevantCategoryIds.has(c._id.toString()))
    .map(c => ({
        ...c,
        _id: c._id,
        isRelevant: true,
    }));

        
        if (isAjax) {
            return res.json({
                products: productsWithOffers,
                totalProducts,
                totalPages,
                currentPage,
                activeCategory: category,
                sort,
                search: searchTrim,
                minPrice,
                maxPrice,
                wishlistIds,
                dbCategories,
                relevantCategoryIds: [...relevantCategoryIds],
            });
        }

        res.render('user/search', {
            title:              'Search',
            products:           productsWithOffers,
            totalProducts,
            totalPages,
            currentPage,
            activeCategory:     category,
            sort,
            search:             searchTrim,
            dbCategories,
            relevantCategoryIds: [...relevantCategoryIds],
            minPrice,
            maxPrice,
            wishlistIds,
        });

    } catch (err) {
        console.error('Search page error:', err.message);
        res.render('user/search', {
            title:           'Search',
            products:        [],
            totalProducts:   0,
            totalPages:      1,
            currentPage:     1,
            activeCategory:  category,
            sort,
            search:          searchTrim,
            dbCategories:    [],
            relevantCategoryIds: [],
            minPrice,
            maxPrice,
            wishlistIds:     [],
        });
    }
}
