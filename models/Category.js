import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    categoryName:    { type: String, required: true, trim: true },
    description:     { type: String, trim: true, default: '' },
    icon:            { type: String, default: 'fa-tags' },
    isActive:        { type: Boolean, default: true },
    isPremium:       { type: Boolean, default: false },
    displayOrder:    { type: Number, default: 1 },
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

export default Category;