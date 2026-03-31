import User from '../../models/Users.js';
import bcrypt from 'bcrypt';
import { signupSchema, passwordSchema } from '../../utils/validators.js';



export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).lean();
        if (!user) return res.redirect('/logout');

        res.render('user/profile/view', {
            title: 'My Profile',
            user,
            activePage: 'profile'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
};



export const getEditProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).lean();
        if (!user) return res.redirect('/logout');

        res.render('user/profile/edit', {
            title: 'Edit Profile',
            user,
            error: null,
            activePage: 'profile'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
};

export const postEditProfile = async (req, res) => {
    try {
        const { firstName, lastName, phone, gender } = req.body;

        await User.findByIdAndUpdate(req.session.user.id, {
            firstName,
            lastName,
            phone,
            gender
        });

        res.redirect('/profile');

    } catch (err) {
        console.error(err);
        const user = await User.findById(req.session.user.id).lean();
        res.render('user/profile/edit', {
            title: 'Edit Profile',
            user,
            error: 'Update failed. Please try again.',
            activePage: 'profile'
        });
    }
};



export const getChangePassword = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).lean();
        if (!user) return res.redirect('/logout');

        res.render('user/profile/change-password', {
            title: 'Change Password',
            user,
            error: null,
            message: null,
            activePage: 'password'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
};

export const postChangePassword = async (req, res) => {
    const user = await User.findById(req.session.user.id);
    if (!user) return res.redirect('/logout');

    const { currentPassword, newPassword, confirmPassword } = req.body;
    const password = newPassword;

    const renderPage = (error, message = null) =>
        res.render('user/profile/change-password', {
            title: 'Change Password',
            user: user.toObject(),
            error,
            message,
            activePage: 'password'
        });

    const validCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validCurrent) return renderPage('Current password is incorrect.');

    if (password !== confirmPassword)
        return renderPage('New passwords do not match.');

    try {
        passwordSchema.parse(password);
    } catch (err) {
        let msg = 'Password does not meet security requirements.';
        if (err && err.errors && err.errors[0] && err.errors[0].message) {
            msg = err.errors[0].message;
        }
        return renderPage(msg);
    }

    const hash = await bcrypt.hash(password, 12);
    await User.findByIdAndUpdate(user._id, { passwordHash: hash });

    renderPage(null, 'Password updated successfully!');
};