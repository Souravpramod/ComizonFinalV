import User from '../models/Users.js';

export const requireUser = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'user') {
        return next();
    }
 
    res.redirect('/login');
};


export const requireAdmin = (req, res, next) => {
    if (req.session && req.session.admin && req.session.admin.role === 'admin') {
        return next();
    }

    res.redirect('/login');
};


export const requireAuth = (req, res, next) => {
    if (
        (req.session && req.session.user) ||
        (req.session && req.session.admin)
    ) {
        return next();
    }
    res.redirect('/login');
};



export const checkBlocked = async (req, res, next) => {
    if (!req.session?.user?.id) return next();

    try {
        const user = await User.findById(req.session.user.id).select('isBlocked').lean();
        if (user && user.isBlocked) {
            req.session.destroy(() => {
                res.clearCookie('user.sid');
                return res.redirect('/blocked');
            });
            return;
        }
    } catch (err) {
        console.error('checkBlocked error:', err.message);
    }

    next();
};