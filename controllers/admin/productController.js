import Product from '../../models/Product.js';
import Category from '../../models/Category.js';
import cloudinary from '../../config/cloudinary.js';
import { uploadToCloudinary } from '../../middlewares/admin/upload.js';

const ITEMS_PER_PAGE = 10;



export const getProducts = async (req, res) => {
    const { search = '', category = '', status = '', sort = 'newest', page = 1 } = req.query;
    const currentPage = Number(page);

    try {
        const query = {};

        const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (search) {
            const safeSearch = escapeRegex(search);

            query.$or = [
                { productName: { $regex: safeSearch, $options: 'i' } },
                { author: { $regex: safeSearch, $options: 'i' } },
                { sku: { $regex: safeSearch, $options: 'i' } }
            ];
        };

       
        if (category && category.match(/^[0-9a-fA-F]{24}$/)) query.categoryId = category;

        if (status === 'instock')    query.stockQuantity = { $gt: 10 };
        if (status === 'lowstock')   query.stockQuantity = { $gte: 1, $lte: 10 };
        if (status === 'outofstock') query.outOfstock = true;

        const sortOption =
            sort === 'name_asc'   ? { productName: 1 }   :
            sort === 'price_asc'  ? { price: 1 }          :
            sort === 'price_desc' ? { price: -1 }         :
            sort === 'stock'      ? { stockQuantity: -1 } :
                                    { createdAt: -1 };

        const totalProducts = await Product.countDocuments(query);
        const products = await Product.find(query)
            .populate('categoryId', 'categoryName')
            .sort(sortOption)
            .skip((currentPage - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE)
            .lean();

        const categories = await Category.find({ isActive: true }).lean();

        res.render('admin/products/index', {
            title: 'Product Management',
            products,
            categories,
            totalProducts,
            totalPages:  Math.ceil(totalProducts / ITEMS_PER_PAGE),
            currentPage,
            search, category, status, sort,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getProducts error:', err.message);
        const categories = await Category.find({ isActive: true }).lean().catch(() => []);
        res.render('admin/products/index', {
            title: 'Product Management',
            products: [], categories, totalProducts: 0, totalPages: 1, currentPage: 1,
            search: '', category: '', status: '', sort: 'newest',
            error: 'Failed to load products', success: null,
        });
    }
};



export const addProduct = async (req, res) => {
    try {
        const {
            productName, author, publisher,
            categoryId, price, stockQuantity,
            description, isPremium
        } = req.body;

        const fieldErrors = {};

        if (!productName || productName.trim() === '') fieldErrors.productName = 'Product name is required';
        if (!categoryId) fieldErrors.categoryId = 'Category must be selected';
        if (!price || isNaN(price) || Number(price) <= 0) fieldErrors.price = 'Price must be a valid positive number';
        if (stockQuantity === undefined || isNaN(stockQuantity) || Number(stockQuantity) < 0) fieldErrors.stockQuantity = 'Stock quantity must be 0 or more';

        if (Object.keys(fieldErrors).length > 0) {
            return res.status(400).json({ ok: false, fieldErrors });
        }

        const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heif', 'image/heic', 'image/avif'];
        const ALLOWED_EXT_REGEX  = /\.(jpe?g|png|heif|heic|avif)$/i;

        const images = [];

        for (let i = 0; i < 3; i++) {
            const uploadedFile = req.files && req.files[`image_${i}`] && req.files[`image_${i}`][0];
            if (uploadedFile) {
                const mimeOk = ALLOWED_MIME_TYPES.includes(uploadedFile.mimetype);
                const extOk  = ALLOWED_EXT_REGEX.test(uploadedFile.originalname);
                if (!mimeOk && !extOk) {
                    return res.status(400).json({
                        ok: false,
                        message: `Image ${i + 1} has an invalid format. Allowed: JPEG, JPG, PNG, HEIF, HEIC, AVIF`
                    });
                }
                const url = await uploadToCloudinary(uploadedFile.buffer);
                images.push(url);
            }
        }

        const qty = parseInt(stockQuantity, 10) || 0;
        const sku = `PRD-${Date.now().toString().slice(-6)}`;

        await Product.create({
            categoryId,
            productName:   productName.trim(),
            author:        author      || '',
            publisher:     publisher   || '',
            description:   description || '',
            price:         parseFloat(price),
            stockQuantity: qty,
            images,
            isPremium:     isPremium === 'true',
            outOfstock:    qty === 0,
            sku,
        });

        return res.json({ ok: true });

    } catch (err) {
        console.error('addProduct error:', err);
        return res.status(500).json({ ok: false, message: err.message });
    }
};



export const getEditProduct = async (req, res) => {
    try {
        const product    = await Product.findById(req.params.id).lean();
        const categories = await Category.find({ isActive: true }).lean();

        if (!product) return res.redirect('/admin/products?error=Product+not+found');

        res.render('admin/products/edit', {
            title: 'Edit Product',
            product,
            categories,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getEditProduct error:', err.message);
        res.redirect('/admin/products?error=Failed+to+load+product');
    }
};



export const updateProduct = async (req, res) => {
    try {
        const {
            productName, author, publisher,
            categoryId, price, stockQuantity,
            description, isPremium
        } = req.body;

        let errors = [];

        if (!productName || productName.trim() === '') {
            errors.push('Product name is required');
        }

        if (!categoryId) {
            errors.push('Category must be selected');
        }

        if (!price || isNaN(price) || Number(price) <= 0) {
            errors.push('Price must be a valid positive number');
        }

        if (stockQuantity === undefined || isNaN(stockQuantity) || Number(stockQuantity) < 0) {
            errors.push('Stock quantity must be 0 or more');
        }

        if (errors.length > 0) {
           
            return res.status(400).json({ ok: false, fieldErrors: {
                ...((!productName || productName.trim() === '') && { productName: 'Product name is required' }),
                ...(!categoryId && { categoryId: 'Category must be selected' }),
                ...((!price || isNaN(price) || Number(price) <= 0) && { price: 'Price must be a valid positive number' }),
                ...((stockQuantity === undefined || isNaN(stockQuantity) || Number(stockQuantity) < 0) && { stockQuantity: 'Stock quantity must be 0 or more' }),
            }});
        }

        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/admin/products?error=Product+not+found');


if (!product.images) product.images = [];
while (product.images.length < 3) product.images.push(null);

for (let i = 0; i < 3; i++) {
    const deleteFlag = req.body[`deleteImage_${i}`];
    const uploadedFile = req.files && req.files[`image_${i}`] && req.files[`image_${i}`][0];

    if (deleteFlag === '1') {
        
        product.images[i] = null;

    } else if (uploadedFile) {
       
        const url = await uploadToCloudinary(uploadedFile.buffer);
        product.images[i] = url;
    }
   
}


product.images = product.images.filter(Boolean);
product.markModified('images');

        const qty = parseInt(stockQuantity, 10) || 0;
        product.productName   = productName.trim();
        product.author        = author      || '';
        product.publisher     = publisher   || '';
        product.categoryId    = categoryId;
        product.price         = parseFloat(price);
        product.stockQuantity = qty;
        product.description   = description || '';
        product.isPremium     = isPremium === 'true';
        product.outOfstock    = qty === 0;

        await product.save();

        res.json({ ok: true });

    } catch (err) {
        console.error('updateProduct error:', err.message);
        res.redirect(`/admin/products/edit/${req.params.id}?error=${encodeURIComponent(err.message)}`);
    }
};



export const deleteProduct = async (req, res) => {
    try {

        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/admin/products?error=Product+not+found');

        product.isActive = false;
        await product.save();


        res.redirect('/admin/products?success=Product+deactivated+successfully');

    } catch (err) {
        console.error('deleteProduct error:', err.message);
        res.redirect('/admin/products?error=Failed+to+deactivate+product');
    }
};

export const activateProduct = async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.id, { isActive: true });
        res.redirect('/admin/products?success=Product+activated');
    } catch (err) {
        res.redirect('/admin/products?error=Failed+to+activate');
    }
};