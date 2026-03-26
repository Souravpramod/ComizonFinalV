import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },
    title:     { type: String, trim: true, default: '' },
    body:      { type: String, trim: true, default: '' },
    rating:    { type: Number, required: true, min: 1, max: 5 },
}, { timestamps: true });


reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);
export default Review;
