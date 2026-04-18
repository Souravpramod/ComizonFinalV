
import crypto    from 'crypto';
import User      from '../../models/Users.js';
import razorpay  from '../../config/razorpay.js';

const PLANS = {
    starter:     { months: 1,  amountUSD: 10,  amountPaise: 1000  },
    advanced:    { months: 6,  amountUSD: 50,  amountPaise: 5000  },
    premium_plus:{ months: 12, amountUSD: 100, amountPaise: 10000 },
};


export const createPremiumOrder = async (req, res) => {
    if (!req.session?.user?.id) return res.status(401).json({ error: 'Login required' });

    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    try {
        const rzpOrder = await razorpay.orders.create({
            amount:   PLANS[plan].amountPaise,
            currency: 'USD',
            receipt:  `premium_${plan}_${Date.now()}`,
            notes:    { plan, userId: req.session.user.id },
        });

        return res.json({
            id:       rzpOrder.id,
            amount:   rzpOrder.amount,
            currency: rzpOrder.currency,
            key:      process.env.RAZORPAY_KEY_ID,
        });

    } catch (err) {
        console.error('createPremiumOrder error:', err.message);
        return res.status(500).json({ error: 'Could not create payment order' });
    }
};


export const verifyPremiumPayment = async (req, res) => {
    if (!req.session?.user?.id) return res.status(401).json({ error: 'Login required' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });


    const body     = razorpay_order_id + '|' + razorpay_payment_id;
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

    if (expected !== razorpay_signature) {
        return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });
    }


    const now     = new Date();
    const expiry  = new Date(now);
    expiry.setMonth(expiry.getMonth() + PLANS[plan].months);


    try {
        await User.findByIdAndUpdate(req.session.user.id, {
            isPremium:        true,
            premiumPlan:      plan,
            premiumExpiresAt: expiry,
        });


        req.session.user.isPremium = true;

        return res.json({ success: true });

    } catch (err) {
        console.error('verifyPremiumPayment error:', err.message);
        return res.status(500).json({ error: 'Could not activate premium' });
    }
};


export const getPremiumSuccess = async (req, res) => {
    if (!req.session?.user?.id) return res.redirect('/login');

    const plan  = req.query.plan || 'premium_plus';
    const user  = await User.findById(req.session.user.id).lean();

    const planMeta = {
        starter:      { label: 'Starter',   months: 1,  color: '#28a745', icon: 'fa-seedling'  },
        advanced:     { label: 'Advanced',  months: 6,  color: '#CD853F', icon: 'fa-rocket'     },
        premium_plus: { label: 'Premium+',  months: 12, color: '#FFD700', icon: 'fa-crown'      },
    };

    res.render('user/premium-success', {
        title: 'Welcome to Premium!',
        plan,
        planMeta: planMeta[plan] || planMeta['premium_plus'],
        user,
        expiresAt: user?.premiumExpiresAt || null,
    });
};


export const getPremiumFailed = (req, res) => {
    res.render('user/premium-failed', {
        title: 'Premium Upgrade Failed',
        reason: req.query.reason || 'An unexpected error occurred.',
        plan:   req.query.plan   || null,
    });
};