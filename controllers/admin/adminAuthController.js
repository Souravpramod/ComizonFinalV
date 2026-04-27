import User     from '../../models/Users.js';
import Order    from '../../models/Order.js';
import Product  from '../../models/Product.js';
import Category from '../../models/Category.js';
import Review   from '../../models/Review.js';
import bcrypt   from 'bcryptjs';

export const getLogin = (req, res) => {
    if (req.session.adminAuth) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { title: 'Admin Login', error: null });
};

export const postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('admin/login', { title: 'Admin Login', error: "Email and password are required" });
        }

        const user = await User.findOne({ email });

        if (!user || user.role !== 'admin') {
            return res.render('admin/login', { title: 'Admin Login', error: "Invalid admin credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.render('admin/login', { title: 'Admin Login', error: "Invalid admin credentials" });
        }

        req.session.adminAuth = {
            id: user._id.toString(),
            email: user.email,
            role: "admin"
        };

        res.redirect('/admin/dashboard');
    } catch (error) {
        res.render('admin/login', { title: 'Admin Login', error: "Login failed. Please try again." });
    }
};

export const logout = (req, res) => {
    delete req.session.adminAuth;
    res.redirect('/admin/login');
};

export const getDashboard = async (req, res) => {
    try {
        
        const [totalOrders, totalUsers, totalProducts, totalCategories] = await Promise.all([
            Order.countDocuments(),
            User.countDocuments({ role: { $ne: 'admin' } }),
            Product.countDocuments({ isActive: true }),
            Category.countDocuments({ isActive: true }),
        ]);

        
        const orderStatusBreakdown = await Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);
        const statusMap = {};
        orderStatusBreakdown.forEach(s => { statusMap[s._id] = s.count; });

        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const revenueChart = await Order.aggregate([
            { $match: {
                orderedAt: { $gte: sevenDaysAgo },
                status:    { $nin: ['cancelled', 'returned'] },
            }},
            { $group: {
                _id:     { $dateToString: { format: '%Y-%m-%d', date: '$orderedAt' } },
                revenue: { $sum: '$total' },
                orders:  { $sum: 1 },
            }},
            { $sort: { _id: 1 } },
        ]);

        
        const chartLabels  = [];
        const chartRevenue = [];
        const chartOrders  = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const found = revenueChart.find(r => r._id === key);
            chartLabels.push(label);
            chartRevenue.push(found ? +found.revenue.toFixed(2) : 0);
            chartOrders.push(found ? found.orders : 0);
        }

      
        const [revenueAgg] = await Order.aggregate([
            { $match: { status: { $nin: ['cancelled', 'returned'] } } },
            { $group: { _id: null, total: { $sum: '$total' } } },
        ]);
        const totalRevenue = revenueAgg?.total || 0;

        
        const mostSoldRaw = await Order.aggregate([
            { $match: { status: { $nin: ['cancelled', 'returned'] } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, image: { $first: '$items.image' }, totalSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
            { $sort:  { totalSold: -1 } },
            { $limit: 5 },
        ]);

        
        const mostSoldCategories = await Order.aggregate([
            { $match: { status: { $nin: ['cancelled', 'returned'] } } },
            { $unwind: '$items' },
            { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'prod' } },
            { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'categories', localField: 'prod.categoryId', foreignField: '_id', as: 'cat' } },
            { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
            { $group: { _id: '$cat._id', name: { $first: '$cat.categoryName' }, totalSold: { $sum: '$items.quantity' } } },
            { $match: { _id: { $ne: null } } },
            { $sort: { totalSold: -1 } },
            { $limit: 5 },
        ]);

        
        const bestReviewed = await Product.find({ isActive: true, 'reviewStat.totalReviews': { $gt: 0 } })
            .sort({ 'reviewStat.averageRating': -1, 'reviewStat.totalReviews': -1 })
            .limit(1)
            .select('productName images reviewStat')
            .lean();

        const worstReviewed = await Product.find({ isActive: true, 'reviewStat.totalReviews': { $gt: 0 } })
            .sort({ 'reviewStat.averageRating': 1, 'reviewStat.totalReviews': -1 })
            .limit(1)
            .select('productName images reviewStat')
            .lean();

      
        const recentOrders = await Order.find()
            .populate('userId', 'firstName lastName')
            .sort({ orderedAt: -1 })
            .limit(8)
            .lean();

        res.render('admin/dashboard', {
            title: 'Dashboard',
            totalOrders,
            totalUsers,
            totalProducts,
            totalCategories,
            totalRevenue,
            statusMap,
            chartLabels:  JSON.stringify(chartLabels),
            chartRevenue: JSON.stringify(chartRevenue),
            chartOrders:  JSON.stringify(chartOrders),
            mostSoldProducts:   mostSoldRaw,
            mostSoldCategories,
            bestReviewed:  bestReviewed[0]  || null,
            worstReviewed: worstReviewed[0] || null,
            recentOrders,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getDashboard error:', err.message);
        res.render('admin/dashboard', {
            title: 'Dashboard',
            totalOrders: 0, totalUsers: 0, totalProducts: 0, totalCategories: 0, totalRevenue: 0,
            statusMap: {}, chartLabels: '[]', chartRevenue: '[]', chartOrders: '[]',
            mostSoldProducts: [], mostSoldCategories: [],
            bestReviewed: null, worstReviewed: null, recentOrders: [],
            error: 'Failed to load dashboard data', success: null,
        });
    }
};


