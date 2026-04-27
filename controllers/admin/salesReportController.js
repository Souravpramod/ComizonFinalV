
import Order from '../../models/Order.js';


export const getSalesReport = async (req, res) => {
    const { period = 'daily', startDate, endDate } = req.query;

    try {
        let dateFrom, dateTo;
        const now = new Date();

        if (period === 'custom' && startDate && endDate) {
            dateFrom = new Date(startDate);
            dateTo   = new Date(endDate);
            dateTo.setHours(23, 59, 59, 999);
        } else if (period === 'weekly') {
            dateFrom = new Date(now);
            dateFrom.setDate(now.getDate() - 6);
            dateFrom.setHours(0, 0, 0, 0);
            dateTo = new Date(now);
            dateTo.setHours(23, 59, 59, 999);
        } else if (period === 'yearly') {
            dateFrom = new Date(now.getFullYear(), 0, 1);
            dateTo   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        } else {
            
            dateFrom = new Date(now);
            dateFrom.setHours(0, 0, 0, 0);
            dateTo   = new Date(now);
            dateTo.setHours(23, 59, 59, 999);
        }

        const matchStage = {
            orderedAt:     { $gte: dateFrom, $lte: dateTo },
            status:        { $nin: ['cancelled', 'returned'] },
            paymentStatus: { $in: ['paid', 'refunded'] },
        };

        
        const [summary] = await Order.aggregate([
            { $match: matchStage },
            { $group: {
                _id:             null,
                totalOrders:     { $sum: 1 },
                totalRevenue:    { $sum: '$total' },
                totalSubtotal:   { $sum: '$subtotal' },
                totalDiscount:   { $sum: { $subtract: ['$subtotal', '$total'] } },
                totalShipping:   { $sum: '$shippingFee' },
                avgOrderValue:   { $avg: '$total' },
            }},
        ]);

       
        const page         = Number(req.query.page) || 1;
        const ITEMS        = 15;
        const totalOrders  = await Order.countDocuments(matchStage);

        const orders = await Order.find(matchStage)
            .populate('userId', 'firstName lastName email')
            .sort({ orderedAt: -1 })
            .skip((page - 1) * ITEMS)
            .limit(ITEMS)
            .lean();

       
        orders.forEach(o => {
            o.couponDiscount = Math.max(0, +(o.subtotal - (o.total - o.shippingFee)).toFixed(2));
        });

        
        const chartData = await Order.aggregate([
            { $match: matchStage },
            { $group: {
                _id:      { $dateToString: { format: '%Y-%m-%d', date: '$orderedAt' } },
                orders:   { $sum: 1 },
                revenue:  { $sum: '$total' },
                discount: { $sum: { $subtract: ['$subtotal', '$total'] } },
            }},
            { $sort: { _id: 1 } },
        ]);

        res.render('admin/sales/index', {
            title: 'Sales Report',
            period, startDate, endDate,
            summary: summary || {
                totalOrders: 0, totalRevenue: 0, totalSubtotal: 0,
                totalDiscount: 0, totalShipping: 0, avgOrderValue: 0,
            },
            orders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ITEMS) || 1,
            currentPage: page,
            chartData,
            dateFrom: dateFrom.toISOString().split('T')[0],
            dateTo:   dateTo.toISOString().split('T')[0],
            error:   req.query.error   || null,
            success: req.query.success || null,
        });
    } catch (err) {
        console.error('getSalesReport error:', err.message);
        res.render('admin/sales/index', {
            title: 'Sales Report',
            period, startDate: '', endDate: '',
            summary: { totalOrders:0, totalRevenue:0, totalSubtotal:0, totalDiscount:0, totalShipping:0, avgOrderValue:0 },
            orders: [], totalOrders: 0, totalPages: 1, currentPage: 1,
            chartData: [], dateFrom: '', dateTo: '',
            error: 'Failed to load report', success: null,
        });
    }
};


export const downloadReport = async (req, res) => {
    const { format = 'excel', period = 'daily', startDate, endDate } = req.query;

    try {
        let dateFrom, dateTo;
        const now = new Date();

        if (period === 'custom' && startDate && endDate) {
            dateFrom = new Date(startDate);
            dateTo   = new Date(endDate);
            dateTo.setHours(23, 59, 59, 999);
        } else if (period === 'weekly') {
            dateFrom = new Date(now); dateFrom.setDate(now.getDate() - 6); dateFrom.setHours(0,0,0,0);
            dateTo   = new Date(now); dateTo.setHours(23,59,59,999);
        } else if (period === 'yearly') {
            dateFrom = new Date(now.getFullYear(), 0, 1);
            dateTo   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        } else {
            dateFrom = new Date(now); dateFrom.setHours(0,0,0,0);
            dateTo   = new Date(now); dateTo.setHours(23,59,59,999);
        }

        const orders = await Order.find({
            orderedAt:     { $gte: dateFrom, $lte: dateTo },
            status:        { $nin: ['cancelled', 'returned'] },
            paymentStatus: { $in: ['paid', 'refunded'] },
        })
            .populate('userId', 'firstName lastName email')
            .sort({ orderedAt: -1 })
            .lean();

        const rows = orders.map(o => ({
            orderId:        o.orderId,
            customer:       `${o.userId?.firstName || ''} ${o.userId?.lastName || ''}`.trim(),
            email:          o.userId?.email || '',
            date:           new Date(o.orderedAt).toLocaleDateString('en-IN'),
            paymentMethod:  o.paymentMethod,
            paymentStatus:  o.paymentStatus,
            subtotal:       o.subtotal.toFixed(2),
            couponDiscount: Math.max(0, (o.subtotal - (o.total - o.shippingFee))).toFixed(2),
            shipping:       o.shippingFee.toFixed(2),
            total:          o.total.toFixed(2),
            status:         o.status,
        }));

        if (format === 'pdf') {
            return generatePDF(res, rows, period, dateFrom, dateTo);
        }
        return generateExcel(res, rows, period, dateFrom, dateTo);

    } catch (err) {
        console.error('downloadReport error:', err.message);
        res.status(500).send('Failed to generate report');
    }
};


function generatePDF(res, rows, period, dateFrom, dateTo) {
    const total = rows.reduce((s, r) => s + parseFloat(r.total), 0);
    const disc  = rows.reduce((s, r) => s + parseFloat(r.couponDiscount), 0);

    const tableRows = rows.map(r => `
        <tr>
            <td>${r.orderId}</td>
            <td>${r.customer}</td>
            <td>${r.date}</td>
            <td>${r.paymentMethod.toUpperCase()}</td>
            <td>$${r.subtotal}</td>
            <td>$${r.couponDiscount}</td>
            <td>$${r.shipping}</td>
            <td>$${r.total}</td>
            <td>${r.status}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Sales Report</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #E63946; padding-bottom: 14px; margin-bottom: 16px; }
            .logo { font-size: 2rem; font-weight: 900; letter-spacing: 3px; color: #111; line-height: 1; }
            .logo span { color: #E63946; }
            .logo-sub { font-size: 0.65rem; color: #888; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
            .report-label { text-align: right; }
            .report-label h2 { font-size: 1.1rem; font-weight: 700; color: #E63946; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; }
            .report-label p  { font-size: 0.75rem; color: #555; margin: 0; }
            .summary { background: #f5f5f5; border-left: 4px solid #E63946; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; display: flex; gap: 20px; flex-wrap: wrap; }
            .summary span { color: #333; }
            .summary strong { color: #E63946; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            th { background: #111; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            tr:nth-child(even) { background: #fafafa; }
            .footer { margin-top: 24px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
        </style></head><body>

        <div class="header">
            <div>
                <div class="logo">COMIZON<span>.</span></div>
                <div class="logo-sub">Premium Comic Book Store</div>
            </div>
            <div class="report-label">
                <h2>Sales Report</h2>
                <p>Period: ${period.charAt(0).toUpperCase()+period.slice(1)}</p>
                <p>${dateFrom.toLocaleDateString('en-IN')} – ${dateTo.toLocaleDateString('en-IN')}</p>
                <p>Generated: ${new Date().toLocaleDateString('en-IN')}</p>
            </div>
        </div>

        <div class="summary">
            <span>Orders: <strong>${rows.length}</strong></span>
            <span>Total Revenue: <strong>₹${total.toFixed(2)}</strong></span>
            <span>Total Discounts: <strong>₹${disc.toFixed(2)}</strong></span>
        </div>

        <table>
            <thead><tr>
                <th>Order ID</th><th>Customer</th><th>Date</th>
                <th>Payment</th><th>Subtotal</th><th>Discount</th>
                <th>Shipping</th><th>Total</th><th>Status</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
        </table>

        <div class="footer">
            COMIZON. &nbsp;|&nbsp; This is a system-generated report. &nbsp;|&nbsp; support@comizon.com
        </div>

        <script>window.onload=()=>window.print();</script>
        </body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}


function generateExcel(res, rows, period, dateFrom, dateTo) {
    const headers = ['Order ID','Customer','Email','Date','Payment Method',
                     'Payment Status','Subtotal ($)','Coupon Discount ($)',
                     'Shipping ($)','Total ($)','Order Status'];

    const csvRows = rows.map(r => [
        r.orderId, `"${r.customer}"`, `"${r.email}"`, r.date,
        r.paymentMethod, r.paymentStatus, r.subtotal,
        r.couponDiscount, r.shipping, r.total, r.status,
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    const filename = `sales-report-${period}-${dateFrom.toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
}