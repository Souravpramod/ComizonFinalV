import mongoose from 'mongoose';
import Product  from '../../models/Product.js';
import Review   from '../../models/Review.js';

const { ObjectId } = mongoose.Types;

export async function getProductById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const product = await Product.findById(id)
        .populate('categoryId', 'categoryName isPremium')
        .lean();
    if (!product || !product.isActive) return null;
    return product;
}



export async function getRecommendations(product, limit = 8) {
    const sameCatCandidates = await Product.find({
        _id:        { $ne: product._id },
        categoryId: product.categoryId,
        isActive:   { $ne: false },
        outOfstock: false,
    }).populate('categoryId', 'categoryName').limit(40).lean();

    const orFilters = [];
    if (product.publisher) orFilters.push({ publisher: product.publisher });
    if (product.author)    orFilters.push({ author:    product.author    });

    let crossCandidates = [];
    if (orFilters.length) {
        crossCandidates = await Product.find({
            _id:        { $ne: product._id },
            isActive:   { $ne: false },
            outOfstock: false,
            $or:        orFilters,
        }).populate('categoryId', 'categoryName').limit(20).lean();
    }

    const seen = new Set();
    const candidates = [];
    for (const p of [...sameCatCandidates, ...crossCandidates]) {
        const key = p._id.toString();
        if (!seen.has(key)) { seen.add(key); candidates.push(p); }
    }

    const now = Date.now();
    const scored = candidates.map(p => {
        let score = 0;
        if (p.categoryId?._id?.toString() === product.categoryId?.toString()) score += 50;
        if (product.publisher && p.publisher &&
            p.publisher.toLowerCase() === product.publisher.toLowerCase()) score += 20;
        if (product.author && p.author &&
            p.author.toLowerCase() === product.author.toLowerCase()) score += 25;
        if (product.isPremium && p.isPremium) score += 10;
        score += (p.reviewStat?.averageRating || 0) * 3;
        const ageDays = (now - new Date(p.createdAt).getTime()) / 86_400_000;
        if (ageDays < 90) score += Math.max(0, 10 - ageDays / 9);
        return { ...p, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, limit);
}



export async function getReviews(productId, page = 1, limit = 5) {
    const skip  = (page - 1) * limit;
    const total = await Review.countDocuments({ productId });
    const items = await Review.find({ productId })
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    return { items, total, pages: Math.ceil(total / limit) || 1 };
}



export async function getRatingBreakdown(productId) {
    const agg = await Review.aggregate([
        { $match: { productId: new ObjectId(productId) } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);
    const map = {};
    agg.forEach(r => { map[r._id] = r.count; });
    const total = Object.values(map).reduce((s, c) => s + c, 0);
    return [5, 4, 3, 2, 1].map(star => ({
        star,
        count: map[star] || 0,
        pct:   total ? Math.round(((map[star] || 0) / total) * 100) : 0,
    }));
}



export async function refreshReviewStat(productId) {
    const agg = await Review.aggregate([
        { $match: { productId: new ObjectId(productId) } },
        { $group: { _id: null, avg: { $avg: '$rating' }, total: { $sum: 1 } } },
    ]);
    const avg   = agg.length ? Math.round(agg[0].avg * 10) / 10 : 0;
    const total = agg.length ? agg[0].total : 0;
    await Product.findByIdAndUpdate(productId, {
        'reviewStat.averageRating': avg,
        'reviewStat.totalReviews':  total,
    });
    return { avg, total };
}



