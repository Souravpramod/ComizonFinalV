import Product from '../../models/Product.js';
import Order   from '../../models/Order.js';
import Category from '../../models/Category.js';

const ITEMS_PER_PAGE = 10;


export const getStock = async (req, res) => {
    const {
        search   = '',
        category = '',
        status   = '',
        sort     = 'newest',
        page     = 1,
    } = req.query;

    const currentPage = Number(page);

    try {
        const query = { isActive: true };

        if (search) {
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { productName: { $regex: safe, $options: 'i' } },
                { sku:         { $regex: safe, $options: 'i' } },
            ];
        }

        if (category && category.match(/^[0-9a-fA-F]{24}$/)) query.categoryId = category;

        if (status === 'instock')    query.stockQuantity = { $gt: 10 };
        if (status === 'lowstock')   query.stockQuantity = { $gte: 1, $lte: 10 };
        if (status === 'outofstock') query.outOfstock = true;

        const sortOption =
            sort === 'stock_asc'  ? { stockQuantity:  1 } :
            sort === 'stock_desc' ? { stockQuantity: -1 } :
            sort === 'name_asc'   ? { productName:    1 } :
            sort === 'price_asc'  ? { price:          1 } :
                                    { createdAt:      -1 };

        const totalProducts = await Product.countDocuments(query);

        const products = await Product.find(query)
            .populate('categoryId', 'categoryName')
            .sort(sortOption)
            .skip((currentPage - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE)
            .lean();

        const categories = await Category.find({ isActive: true }).lean();

    
        const inStock    = await Product.countDocuments({ isActive: true, stockQuantity: { $gt: 10 } });
        const lowStock   = await Product.countDocuments({ isActive: true, stockQuantity: { $gte: 1, $lte: 10 } });
        const outOfStock = await Product.countDocuments({ isActive: true, outOfstock: true });
        const totalStock = await Product.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: null, total: { $sum: '$stockQuantity' } } },
        ]);

        res.render('admin/stock/index', {
            title: 'Stock Management',
            products,
            categories,
            totalProducts,
            totalPages: Math.ceil(totalProducts / ITEMS_PER_PAGE),
            currentPage,
            search, category, status, sort,
            stats: {
                inStock,
                lowStock,
                outOfStock,
                totalUnits: totalStock[0]?.total || 0,
            },
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getStock error:', err.message);
        res.render('admin/stock/index', {
            title: 'Stock Management',
            products: [], categories: [], totalProducts: 0, totalPages: 1, currentPage: 1,
            search: '', category: '', status: '', sort: 'newest',
            stats: { inStock: 0, lowStock: 0, outOfStock: 0, totalUnits: 0 },
            error: 'Failed to load stock data', success: null,
        });
    }
};



export const updateStock = async (req, res) => {
    const { id } = req.params;
    const qty = parseInt(req.body.stockQuantity, 10);

    if (isNaN(qty) || qty < 0) {
        return res.status(400).json({ ok: false, message: 'Invalid quantity' });
    }

    try {
        const product = await Product.findById(id);
        if (!product) return res.status(404).json({ ok: false, message: 'Product not found' });

        product.stockQuantity = qty;
        product.outOfstock    = qty === 0;
        await product.save();

        return res.json({ ok: true, stockQuantity: qty, outOfstock: qty === 0 });

    } catch (err) {
        console.error('updateStock error:', err.message);
        return res.status(500).json({ ok: false, message: err.message });
    }
};



export const getStockHistory = async (req, res) => {
    const { id } = req.params;
    try {
        const product = await Product.findById(id).populate('categoryId', 'categoryName').lean();
        if (!product) return res.redirect('/admin/stock?error=Product+not+found');

        
        const orders = await Order.find({ 'items.productId': id })
            .populate('userId', 'firstName lastName email')
            .sort({ orderedAt: -1 })
            .lean();

        
        const unitRows = [];
        orders.forEach(order => {
            const item = order.items.find(i => i.productId.toString() === id);
            if (!item) return;
            item.unitStatuses.forEach(u => {
                unitRows.push({
                    orderId:   order.orderId,
                    orderDbId: order._id,
                    customer:  order.userId
                        ? `${order.userId.firstName} ${order.userId.lastName}`.trim()
                        : 'N/A',
                    email:     order.userId?.email || '',
                    unitIndex: u.unitIndex,
                    status:    u.status,
                    date:      order.orderedAt,
                });
            });
        });

        res.render('admin/stock/history', {
            title: `Stock History – ${product.productName}`,
            product,
            unitRows,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getStockHistory error:', err.message);
        res.redirect('/admin/stock?error=Failed+to+load+history');
    }
};
