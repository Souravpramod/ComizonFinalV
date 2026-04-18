import mongoose from 'mongoose';
import Order   from '../../models/Order.js';
import Product from '../../models/Product.js';

const ITEMS_PER_PAGE = 10;


export const getOrders = async (req, res) => {
    const {
        search = '',
        status = '',
        sort   = 'newest',
        page   = 1,
    } = req.query;

    const currentPage = Number(page);

    try {
        const query = {};

        if (search) {
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { orderId:              { $regex: safe, $options: 'i' } },
                { 'items.productName':  { $regex: safe, $options: 'i' } },
            ];
        }

        if (status) query.status = status;

        const sortOption =
            sort === 'oldest'       ? { orderedAt:  1 } :
            sort === 'total_asc'    ? { total:       1 } :
            sort === 'total_desc'   ? { total:      -1 } :
                                      { orderedAt:  -1 };  

        const totalOrders = await Order.countDocuments(query);

        const orders = await Order.find(query)
            .populate('userId', 'firstName lastName email phone')
            .sort(sortOption)
            .skip((currentPage - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE)
            .lean();


        const [stats] = await Order.aggregate([
            { $group: {
                _id:       null,
                total:     { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'delivered']  }, 1, 0] } },
                pending:   { $sum: { $cond: [{ $in:  ['$status', ['pending','processing','shipped','out_for_delivery']] }, 1, 0] } },
                cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'return_requested']] }, 1, 0] } },
            }},
        ]).catch(() => [{}]);

        res.render('admin/orders/index', {
            title: 'Order Management',
            orders,
            totalOrders,
            totalPages:  Math.ceil(totalOrders / ITEMS_PER_PAGE),
            currentPage,
            search, status, sort,
            stats: stats || { total: 0, completed: 0, pending: 0, cancelled: 0 },
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getOrders error:', err.message);
        res.render('admin/orders/index', {
            title: 'Order Management',
            orders: [], totalOrders: 0, totalPages: 1, currentPage: 1,
            search: '', status: '', sort: 'newest',
            stats: { total: 0, completed: 0, pending: 0, cancelled: 0 },
            error: 'Failed to load orders', success: null,
        });
    }
};



export const getOrderDetail = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('userId', 'firstName lastName email phone')
            .populate('items.productId', 'productName images sku')
            .lean();

        if (!order) return res.redirect('/admin/orders?error=Order+not+found');

        res.render('admin/orders/detail', {
            title: 'Order Detail',
            order,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getOrderDetail error:', err.message);
        res.redirect('/admin/orders?error=Failed+to+load+order');
    }
};



export const updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const VALID = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested'];

    if (!VALID.includes(status)) {
        return res.status(400).json({ ok: false, message: 'Invalid status' });
    }

    try {
        const order = await Order.findById(id).populate('items.productId');
        if (!order) return res.status(404).json({ ok: false, message: 'Order not found' });

        const prevStatus = order.status;


        const LOCKED_STATES = ['cancelled', 'delivered', 'return_requested','out_for_delivery','returned'];
        if (LOCKED_STATES.includes(prevStatus)) {
            return res.status(400).json({
                ok: false,
                message: `Order is already ${prevStatus.replace(/_/g, ' ')} and cannot be changed.`,
            });
        }


        order.status = status;


        const TERMINAL = ['cancelled', 'delivered', 'return_requested', 'returned', 'out_for_delivery'];
        order.items.forEach(item => {
            if (!TERMINAL.includes(item.itemStatus)) {
                item.itemStatus = status;
                item.unitStatuses.forEach(u => {
                    if (!TERMINAL.includes(u.status)) u.status = status;
                });
            }
        });


        if (status === 'cancelled' && prevStatus !== 'cancelled') {
            for (const item of order.items) {
                if (item.itemStatus !== 'cancelled') {
                    await Product.findByIdAndUpdate(item.productId, {
                        $inc: { stockQuantity: item.quantity },
                        outOfstock: false,
                    });
                }
            }
            order.paymentStatus = 'refunded';
        }


        if (status === 'delivered') {
            order.paymentStatus = 'paid';
            order.deliveredAt   = new Date();
        }


        if (['cancelled', 'return_requested', 'returned'].includes(status)) {
            order.items.forEach(i => { i.attention = 1; });
        }

        await order.save();
        return res.json({ ok: true, status });

    } catch (err) {
        console.error('updateOrderStatus error:', err.message);
        return res.status(500).json({ ok: false, message: err.message });
    }
};



export const updateUnitStatus = async (req, res) => {
    const { orderId, itemId, unitIndex } = req.params;
    const { status } = req.body;

    const VALID = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested'];
    if (!VALID.includes(status)) {
        return res.status(400).json({ ok: false, message: 'Invalid status' });
    }

    try {
        const order = await Order.findById(orderId).populate('items.productId');
        if (!order) return res.status(404).json({ ok: false, message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ ok: false, message: 'Item not found' });

        const unit = item.unitStatuses.find(u => u.unitIndex === Number(unitIndex));
        if (!unit) return res.status(404).json({ ok: false, message: 'Unit not found' });

       



        const UNIT_LOCKED  = ['cancelled', 'delivered', 'return_requested', 'returned', 'out_for_delivery'];
        const ITEM_LOCKED  = ['cancelled', 'delivered', 'return_requested', 'returned', 'out_for_delivery'];
        const ORDER_LOCKED = ['cancelled', 'delivered', 'return_requested', 'returned', 'out_for_delivery'];
        if (ORDER_LOCKED.includes(order.status) || ITEM_LOCKED.includes(item.itemStatus) || UNIT_LOCKED.includes(unit.status)) {
            return res.status(400).json({
                ok: false,
                message: `Cannot update — this unit, item, or order is already in a terminal state.`,
            });
        }


        const prevStatus = unit.status;
        unit.status = status;


        if (status === 'cancelled' && prevStatus !== 'cancelled') {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stockQuantity: 1 },
            });
        }


        const UNIT_ONLY = ['return_requested', 'returned','cancelled',''];
        const allItemUnits = item.unitStatuses.map(u => u.status);
        const itemAllSame  = allItemUnits.every(s => s === allItemUnits[0]);
        if (!UNIT_ONLY.includes(item.itemStatus)) {
            item.itemStatus = itemAllSame ? allItemUnits[0] : 'processing';
        }

        if (!UNIT_ONLY.includes(order.status)) {
            const allUnits = order.items.flatMap(i => i.unitStatuses.map(u => u.status));
            const allSame  = allUnits.every(s => s === allUnits[0]);
            order.status   = allSame ? allUnits[0] : 'processing';
        }


        if (order.status === 'delivered' && !order.deliveredAt) {
            order.deliveredAt   = new Date();
            order.paymentStatus = 'paid';
        }


        if (['cancelled', 'return_requested', 'returned'].includes(status)) {
            item.attention = 1;
        }

        await order.save();

        return res.json({ ok: true, unitStatus: status, orderStatus: order.status });

    } catch (err) {
        console.error('updateUnitStatus error:', err.message);
        return res.status(500).json({ ok: false, message: err.message });
    }
};



export const getManageRequests = async (req, res) => {
    try {
        const orders = await Order.find({
            items: {
                $elemMatch: {
                    itemStatus:      'return_requested',
                    attention:       1,
                    flaggedresponse: 0,
                },
            },
        })
            .populate('userId', 'firstName lastName email')
            .lean();

        const requests = [];
        for (const order of orders) {
            for (const item of order.items) {
                if (item.itemStatus      === 'return_requested'
                    && item.attention       === 1
                    && item.flaggedresponse === 0) {
                    requests.push({
                        orderId:       order._id,
                        orderRef:      order.orderId,
                        userId:        order.userId,
                        total:         order.total,
                        paymentStatus: order.paymentStatus,
                        paymentMethod: order.paymentMethod,
                        itemId:        item._id,
                        productName:   item.productName,
                        sku:           item.sku,
                        image:         item.image,
                        price:         item.price,
                        quantity:      item.quantity,
                        lineTotal:     item.lineTotal,
                        itemStatus:    item.itemStatus,
                        cancelReason:  item.cancelReason,
                        returnReason:  item.returnReason,
                    });
                }
            }
        }

        res.render('admin/orders/manage-requests', {
            title: 'Manage Requests',
            requests,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) {
        console.error('getManageRequests error:', err.message);
        res.redirect('/admin/orders?error=Failed+to+load+requests');
    }
};


export const resolveCancel = async (req, res) => {
    const { orderId, itemId } = req.params;

    try {
        const order = await Order.findById(orderId).populate('items.productId');
        if (!order) return res.status(404).json({ ok: false, message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ ok: false, message: 'Item not found' });

        if (item.itemStatus !== 'cancelled')
            return res.status(400).json({ ok: false, message: 'Item is not in cancelled state' });

       
        item.attention       = 0;
        item.flaggedresponse = 1;

        await order.save();
        return res.json({ ok: true, message: 'Cancellation confirmed. Refund acknowledged.' });

    } catch (err) {
        console.error('resolveCancel error:', err.message);
        return res.status(500).json({ ok: false, message: err.message });
    }
};


export const resolveReturn = async (req, res) => {
    const { orderId, itemId } = req.params;
    const { action } = req.body;

    try {
        const order = await Order.findById(orderId).populate('items.productId');
        if (!order) return res.status(404).json({ ok: false, message: 'Order not found' });

        const item = order.items.id(itemId);
        if (!item) return res.status(404).json({ ok: false, message: 'Item not found' });

        if (item.itemStatus !== 'return_requested')
            return res.status(400).json({ ok: false, message: 'Item is not in return_requested state' });

        if (action === 'approve') {
           
            await Product.findByIdAndUpdate(item.productId, {
                $inc:      { stockQuantity: item.quantity },
                outOfstock: false,
            });

            item.itemStatus      = 'returned';
            item.attention       = 0;
            item.flaggedresponse = 1;
            item.unitStatuses.forEach(u => { u.status = 'returned'; });

            const allStatuses = order.items.map(i => i.itemStatus);
            const allDone     = allStatuses.every(s => ['returned', 'cancelled'].includes(s));
            if (allDone) order.status = 'returned';
            order.paymentStatus = 'refunded';

            await order.save();
            return res.json({ ok: true, message: 'Return approved. Stock restored and refund issued.' });

        } else if (action === 'reject') {
            item.itemStatus      = 'delivered';
            item.returnReason    = '';
            item.attention       = 0;
            item.flaggedresponse = 1;
            item.unitStatuses.forEach(u => { u.status = 'delivered'; });


            const allStatuses    = order.items.map(i => i.itemStatus);
            const uniqueStatuses = [...new Set(allStatuses)];
            if (uniqueStatuses.length === 1) {
                order.status = uniqueStatuses[0];
            } else if (allStatuses.every(s => ['returned', 'cancelled', 'delivered'].includes(s))) {
                order.status = allStatuses.includes('returned') ? 'returned' : 'delivered';
            } else {
                order.status = 'processing';
            }


            const hasReturnPending = allStatuses.some(s => ['return_requested', 'returned'].includes(s));
            if (!hasReturnPending) order.paymentStatus = 'paid';

            await order.save();
            return res.json({ ok: true, message: 'Return rejected. Item restored to delivered.' });

        } else {
            return res.status(400).json({ ok: false, message: 'Invalid action' });
        }

    } catch (err) {
        console.error('resolveReturn error:', err.message);
        return res.status(500).json({ ok: false, message: err.message });
    }
};