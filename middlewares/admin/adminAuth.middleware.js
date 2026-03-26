export const isAdminAuthenticated = (req, res, next) => {
    if (!req.session.adminAuth) {
        return res.redirect('/admin/login');
    }
    next();
};
