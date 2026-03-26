import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    productName:   { type: String, required: true, trim: true },
    author:        { type: String, trim: true, default: '' },
    publisher:     { type: String, trim: true, default: '' },
    description:   { type: String, trim: true, default: '' },
    price:         { type: Number, required: true, min: 0 },
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    images: {
        type: [String],
        default: []
    },
    isPremium:     { type: Boolean, default: false },
    outOfstock:    { type: Boolean, default: false },
    isActive:      { type: Boolean, default: true },
    sku:           { type: String, trim: true, default: '' },
    reviewStat: {
        averageRating: { type: Number, default: 0 },
        totalReviews:  { type: Number, default: 0 },
    },
}, { timestamps: true });


productSchema.pre('save', function (next) {
    this.outOfstock = this.stockQuantity === 0;
    
});

const Product = mongoose.model('Product', productSchema);

export default Product;