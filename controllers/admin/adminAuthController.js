import User from '../../models/Users.js';

import bcrypt from 'bcryptjs';

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

        res.redirect('/admin/users');
    } catch (error) {
        res.render('admin/login', { title: 'Admin Login', error: "Login failed. Please try again." });
    }
};

export const logout = (req, res) => {
    delete req.session.adminAuth;
    res.redirect('/admin/login');
};

export const getDashboard = (req, res) => {
   
    res.redirect('/admin/users');
};
