import mongoose from 'mongoose';
import Product  from '../../models/Product.js';
import Wishlist from '../../models/Wishlist.js';
import Review   from '../../models/Review.js';
import { getBestOfferForProduct } from '../admin/offerController.js';
import {
    getProductById,
    getRecommendations,
    getReviews,
    getRatingBreakdown,
    refreshReviewStat,
} from '../../services/user/productService.js';



function mapRec(p) {
    return {
        _id:      p._id.toString(),
        name:     p.productName,
        image:    (p.images && p.images.length > 0)
                    ? p.images[0]
                    : 'https://placehold.co/300x450/1a1a1a/E63946?text=No+Image',
        price:              p.price,
        effectivePrice:     p.offerResult ? p.offerResult.effectivePrice : p.price,
        offerBadge:         p.offerResult
                              ? (p.offerResult.discountType === 'flat'
                                  ? `$${p.offerResult.discountValue} OFF`
                                  : `${p.offerResult.discountValue}% OFF`)
                              : null,
        badgeColorListing:  p.offerResult?.badgeColorListing || '#E63946',
        category:           p.categoryId?.categoryName || '',
        badge:              p.isPremium
                              ? 'PREMIUM'
                              : (p.stockQuantity > 0 && p.stockQuantity <= 5 ? 'HOT' : null),
        rating:   p.reviewStat?.averageRating || 0,
        reviews:  p.reviewStat?.totalReviews  || 0,
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

        
        if (!product.isActive) {
            const listing = listingRedirect(product);
            let wishlistIds = [];
        if (req.session?.user?.id) {
            const wishlist = await Wishlist.findOne({ userId: req.session.user.id }).lean();
            wishlistIds = (wishlist?.products || []).map(w => w.productId.toString());
        }

        res.render('user/product-detail', {
            wishlistIds,
                title:           'Product Unavailable',
                product,
                status:          'unavailable',
                isBlocked:       true,
                listingUrl:      listing.path,
                listingLabel:    listing.label,
                categoryUrl:     listing.path,
                recommendations: [],
                reviews:         [],
                reviewTotal:     0,
                reviewPages:     1,
                reviewPage:      1,
                ratingBreakdown: [],
                userHasReviewed: false,
                isLoggedIn:      !!req.session?.user,
                discount:        0,
                originalPrice:   null,
            });
        }

        const status = product.outOfstock || product.stockQuantity === 0 ? 'outofstock'
                     : product.stockQuantity <= 3 ? 'low'
                     : 'available';

        const [rawRecs, reviewData, ratingBreakdown] = await Promise.all([
            getRecommendations(product, 8),
            getReviews(id, reviewPage, 5),
            getRatingBreakdown(id),
        ]);

        
        const recommendations = await Promise.all(
            rawRecs.map(async (rec) => {
                const catId = rec.categoryId?._id || rec.categoryId;
                const offerResult = await getBestOfferForProduct(rec._id, catId, rec.price);
                return { ...rec, offerResult };
            })
        );

        let userHasReviewed = false;
        if (req.session?.user?.id) {
            userHasReviewed = !!(await Review.findOne({
                productId: id,
                userId:    req.session.user.id,
            }).lean());
        }

        
        const offerResult   = await getBestOfferForProduct(
            product._id,
            product.categoryId?._id || product.categoryId,
            product.price
        );
        const discount          = offerResult ? offerResult.discount : 0;
        const originalPrice     = offerResult ? product.price : null;
        const effectivePrice    = offerResult ? offerResult.effectivePrice : product.price;
        const offerLabel        = offerResult?.offerLabel        || null;
        const badgeColorDetail  = offerResult?.badgeColorDetail  || '#E63946';
        const badgeColorListing = offerResult?.badgeColorListing || '#E63946';
        const offerDiscountType = offerResult?.discountType      || null;
        const offerDiscountValue = offerResult?.discountValue    || 0;

        const listing       = listingRedirect(product);
        const categoryId    = product?.categoryId?._id?.toString() || '';
       
        const categoryUrl   = categoryId
            ? `${listing.path}?category=${categoryId}&sort=featured&search=&minPrice=0&maxPrice=1000&page=1`
            : listing.path;

        let wishlistIds = [];
        if (req.session?.user?.id) {
            const wishlist = await Wishlist.findOne({ userId: req.session.user.id }).lean();
            wishlistIds = (wishlist?.products || []).map(w => w.productId.toString());
        }

        res.render('user/product-detail', {
            title:           product.productName,
            product,
            status,
            wishlistIds,
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
            effectivePrice,
            offerLabel,
            badgeColorDetail,
            badgeColorListing,
            offerDiscountType,
            offerDiscountValue,
            error:   req.query.error   || null,
            success: req.query.added === '1' ? 'Item added to cart successfully!' : null,
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