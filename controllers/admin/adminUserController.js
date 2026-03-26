import User from '../../models/Users.js';

import bcrypt from 'bcryptjs';

export const getUsers = async (req, res) => {
    const { search = '', status = '', role = '', sort = 'newest', page = 1 } = req.query;
    const limit = 10;
    try {
        const query = {};
        const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (search) {
            const safeSearch = escapeRegex(search);

            query.$or = [
                { firstName: { $regex: safeSearch, $options: 'i' } },
                { lastName: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
            ];
        }
        if (status === 'blocked') query.isActive = false;
        if (status === 'active') query.isActive = true;

        if (role === 'admin') query.role = 'admin';
        else if (role === 'premium') query.isPremium = true;
        else if (role === 'user') {
            query.role = { $ne: 'admin' };
            query.isPremium = { $ne: true };
        }

        const sortOption = sort === 'oldest' ? { createdAt: 1 }
            : sort === 'az' ? { firstName: 1 }
                : { createdAt: -1 };

        const totalUsers = await User.countDocuments(query);
        const users = await User.find(query)
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const allUsersCount = await User.countDocuments();
        const regularCount = await User.countDocuments({ role: { $ne: 'admin' }, isPremium: { $ne: true } });
        const premiumCount = await User.countDocuments({ isPremium: true });
        const adminCount = await User.countDocuments({ role: 'admin' });

        res.render('admin/users/index', {
            title: 'User Management', users, totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
            currentPage: Number(page), limit, search, status, role, sort,
            allUsersCount, regularCount, premiumCount, adminCount,
            error: req.query.error || null
        });
    } catch (err) {
        console.error('Admin users error:', err.message);
        res.render('admin/users/index', {
            title: 'User Management', users: [], totalUsers: 0,
            totalPages: 1, currentPage: 1, limit, search, status, role: '', sort,
            allUsersCount: 0, regularCount: 0, premiumCount: 0, adminCount: 0,
            error: "Failed to load users"
        });
    }
};

export const postToggleBlock = async (req, res) => {
    try {
        const userId = req.params.id;
        if (req.session.adminAuth && req.session.adminAuth.id === userId) {
            return res.redirect('/admin/users?error=Cannot block your own admin account');
        }

        const user = await User.findById(userId);
        if (user) {
            user.isActive = !user.isActive;
            user.isBlocked = !user.isActive;
            await user.save();
            console.log(`User ${user.email} → isActive: ${user.isActive}`);
        }
    } catch (err) {
        console.error('Toggle block error:', err.message);
    }
    res.redirect('/admin/users');
};

export const createUser = async (req, res) => {
    const {
        firstName, lastName, email, password, role, isPremium,
        username, phone, addressLane1, addressLane2, city, state, country, pincode, label
    } = req.body;

    
    const rerenderAdd = async (fieldErrors) => {
        const { search = '', status = '', role: roleQ = '', sort = 'newest', page = 1 } = req.query;
        const limit = 10;
        const query = {};
        const totalUsers = await User.countDocuments(query);
        const users = await User.find(query)
            .sort({ createdAt: -1 }).skip(0).limit(limit).lean();
        const allUsersCount = await User.countDocuments();
        const regularCount  = await User.countDocuments({ role: { $ne: 'admin' }, isPremium: { $ne: true } });
        const premiumCount  = await User.countDocuments({ isPremium: true });
        const adminCount    = await User.countDocuments({ role: 'admin' });

        return res.render('admin/users/index', {
            title: 'User Management', users, totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
            currentPage: 1, limit,
            search: '', status: '', role: '', sort: 'newest',
            allUsersCount, regularCount, premiumCount, adminCount,
            error: null,
            openAddModal: true,
            addFormData: req.body,
            addFieldErrors: fieldErrors,
            openEditModal: false,
            editFieldErrors: {},
            editFormData: {},
        });
    };

    try {
        const fieldErrors = {};

        if (!firstName || !firstName.trim()) fieldErrors.firstName = 'First name is required';
        if (!lastName  || !lastName.trim())  fieldErrors.lastName  = 'Last name is required';
        if (!email     || !email.trim())     fieldErrors.email     = 'Email is required';
        if (!password  || password.length < 6) fieldErrors.password = 'Password must be at least 6 characters';

        if (!fieldErrors.email && email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) fieldErrors.email = 'Email already exists';
        }

        if (Object.keys(fieldErrors).length > 0) return await rerenderAdd(fieldErrors);

        const passwordHash  = await bcrypt.hash(password, 10);
        const premiumStatus = isPremium === 'true';
        const userRole      = role === 'admin' ? 'admin' : 'user';

        const addresses = [];
        if (addressLane1 || city || state || country) {
            addresses.push({
                type: label || 'Primary',
                addressLane1, addressLane2, city, state, country, pincode, isDefault: true
            });
        }

        const newUser = new User({
            firstName, lastName, username, email, phone,
            passwordHash, role: userRole,
            isPremium: premiumStatus, isActive: true, isBlocked: false, addresses
        });

        await newUser.save();
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Create user error:', err.message);
        res.redirect('/admin/users?error=Could not create user');
    }
};

export const updateUser = async (req, res) => {
    const { firstName, lastName, email, role, isPremium, status } = req.body;
    const userId = req.params.id;

    // helper: re-render with edit modal open and inline errors
    const rerenderEdit = async (fieldErrors) => {
        const limit = 10;
        const query = {};
        const totalUsers   = await User.countDocuments(query);
        const users        = await User.find(query).sort({ createdAt: -1 }).limit(limit).lean();
        const allUsersCount = await User.countDocuments();
        const regularCount  = await User.countDocuments({ role: { $ne: 'admin' }, isPremium: { $ne: true } });
        const premiumCount  = await User.countDocuments({ isPremium: true });
        const adminCount    = await User.countDocuments({ role: 'admin' });

        return res.render('admin/users/index', {
            title: 'User Management', users, totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
            currentPage: 1, limit,
            search: '', status: '', role: '', sort: 'newest',
            allUsersCount, regularCount, premiumCount, adminCount,
            error: null,
            openAddModal: false,
            addFormData: {}, addFieldErrors: {},
            openEditModal: true,
            editUserId: userId,
            editFormData: req.body,
            editFieldErrors: fieldErrors,
        });
    };

    try {
        const fieldErrors = {};

        if (!firstName || !firstName.trim()) fieldErrors.firstName = 'First name is required';
        if (!lastName  || !lastName.trim())  fieldErrors.lastName  = 'Last name is required';
        if (!email     || !email.trim())     fieldErrors.email     = 'Email is required';

        const user = await User.findById(userId);
        if (!user) return res.redirect('/admin/users?error=User not found');

        if (req.session.adminAuth && req.session.adminAuth.id === userId && role !== 'admin')
            return res.redirect('/admin/users?error=Cannot downgrade your own admin account');

        if (req.session.adminAuth && req.session.adminAuth.id === userId && status === 'blocked')
            return res.redirect('/admin/users?error=Cannot block your own admin account');

        if (!fieldErrors.email && email !== user.email) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) fieldErrors.email = 'Email already in use';
        }

        if (Object.keys(fieldErrors).length > 0) return await rerenderEdit(fieldErrors);

        user.firstName = firstName;
        user.lastName  = lastName;
        if (email !== user.email) user.email = email;
        user.isPremium = isPremium === 'true';
        user.role      = role === 'admin' ? 'admin' : 'user';
        user.isActive  = status !== 'blocked';
        user.isBlocked = !user.isActive;

        await user.save();
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Update user error:', err.message);
        res.redirect('/admin/users?error=Could not update user');
    }
};

export const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;

        if (req.session.adminAuth && req.session.adminAuth.id === userId) {
            return res.redirect('/admin/users?error=Cannot delete your own admin account');
        }

        await User.findByIdAndDelete(userId);
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Delete user error:', err.message);
        res.redirect('/admin/users?error=Could not delete user');
    }
};
