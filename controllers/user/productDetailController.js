import mongoose from 'mongoose';
import Product  from '../../models/Product.js';
import Review   from '../../models/Review.js';
import {
    getProductById,
    getRecommendations,
    getReviews,
    getRatingBreakdown,
    refreshReviewStat,
} from '../../services/user/productService.js';



function mapRec(p) {
    return {
        _id: p._id.toString(),
        name: p.productName,


        image: (p.images && p.images.length > 0)
            ? p.images[0]
            : 'https://placehold.co/300x450/1a1a1a/E63946?text=No+Image',

        price: p.price,
        category: p.categoryId?.categoryName || '',
        badge: p.isPremium
            ? 'PREMIUM'
            : (p.stockQuantity > 0 && p.stockQuantity <= 5 ? 'HOT' : null),

        rating: p.reviewStat?.averageRating || 0,
        reviews: p.reviewStat?.totalReviews || 0
    };
}


function listingRedirect(product) {
    const cat = (product?.categoryId?.categoryName || '').toLowerCase();
    if (cat === 'marvel' || cat === 'dc') return { path: '/american', label: 'American Comics' };
    if (cat === 'manga')                  return { path: '/manga',    label: 'Manga' };
    if (cat === 'toys')                   return { path: '/toys',     label: 'Toys & Figures' };
    return { path: '/', label: 'Home' };
}



export const getProductDetail = async (req, res) => {
    const { id } = req.params;
    const reviewPage = Number(req.query.reviewPage) || 1;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.redirect('/');

    try {
        const product = await getProductById(id);
        if (!product) return res.redirect('/');

        const status = product.outOfstock || product.stockQuantity === 0 ? 'outofstock'
                     : product.stockQuantity <= 3 ? 'low'
                     : 'available';

        const [recommendations, reviewData, ratingBreakdown] = await Promise.all([
            getRecommendations(product, 8),
            getReviews(id, reviewPage, 5),
            getRatingBreakdown(id),
        ]);

        let userHasReviewed = false;
        if (req.session?.user?.id) {
            userHasReviewed = !!(await Review.findOne({
                productId: id,
                userId:    req.session.user.id,
            }).lean());
        }

        const discount      = product.isPremium ? 25 : 0;
        const originalPrice = discount ? +(product.price / (1 - discount / 100)).toFixed(2) : null;

        const listing       = listingRedirect(product);
        const categoryId    = product?.categoryId?._id?.toString() || '';
        // Build filtered category URL: page + category ID pre-applied
        const categoryUrl   = categoryId
            ? `${listing.path}?category=${categoryId}&sort=featured&search=&minPrice=0&maxPrice=1000&page=1`
            : listing.path;

        res.render('user/product-detail', {
            title:           product.productName,
            product,
            status,
            listingUrl:      listing.path,     
            listingLabel:    listing.label,    
            categoryUrl,                       
            recommendations: recommendations.map(mapRec),
            reviews:         reviewData.items,
            reviewTotal:     reviewData.total,
            reviewPages:     reviewData.pages,
            reviewPage,
            ratingBreakdown,
            userHasReviewed,
            isLoggedIn:      !!req.session?.user,
            discount,
            originalPrice,
        });
    } catch (err) {
        console.error('getProductDetail error:', err);
        res.redirect('/');
    }
};



export const getWriteReview = async (req, res) => {
    const { id } = req.params;

    if (!req.session?.user?.id) return res.redirect('/login');
    if (!mongoose.Types.ObjectId.isValid(id)) return res.redirect('/');

    const product = await getProductById(id);
    if (!product) return res.redirect('/');

  
    const existing = await Review.findOne({ productId: id, userId: req.session.user.id }).lean();

    const listing   = listingRedirect(product);
    const categoryId = product?.categoryId?._id?.toString() || '';
    const categoryUrl = categoryId
        ? `${listing.path}?category=${categoryId}&sort=featured&search=&minPrice=0&maxPrice=1000&page=1`
        : listing.path;

    res.render('user/write-review', {
        title:       `Review — ${product.productName}`,
        product,
        existing:    existing || null,
        error:       null,
        listingUrl:  listing.path,
        listingLabel: listing.label,
        categoryUrl,
    });
};



export const postWriteReview = async (req, res) => {
    const { id } = req.params;

    if (!req.session?.user?.id) return res.redirect('/login');
    if (!mongoose.Types.ObjectId.isValid(id)) return res.redirect('/');

    const product = await getProductById(id);
    if (!product) return res.redirect('/');

    const { rating, title = '', body = '' } = req.body;
    const ratingNum = Number(rating);


    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
        const listing    = listingRedirect(product);
        const categoryId = product?.categoryId?._id?.toString() || '';
        const categoryUrl = categoryId
            ? `${listing.path}?category=${categoryId}&sort=featured&search=&minPrice=0&maxPrice=1000&page=1`
            : listing.path;

        return res.render('user/write-review', {
            title:        `Review — ${product.productName}`,
            product,
            existing:     null,
            error:        'Please select a rating between 1 and 5.',
            listingUrl:   listing.path,
            listingLabel: listing.label,
            categoryUrl,
        });
    }

    try {
        await Review.findOneAndUpdate(
            { productId: id, userId: req.session.user.id },
            { rating: ratingNum, title: title.trim(), body: body.trim() },
            { upsert: true, new: true }
        );
        await refreshReviewStat(id);
        return res.redirect(`/product/${id}?reviewed=1`);
    } catch (err) {
        console.error('postWriteReview error:', err.message);
        return res.render('user/write-review', {
            title:    `Review — ${product.productName}`,
            product,
            existing: null,
            error:    'Something went wrong. Please try again.',
        });
    }
};