import User from '../../models/Users.js';
import OTP  from '../../models/OTP.js';
import bcrypt from 'bcrypt';
import { signupSchema, passwordSchema } from '../../utils/validators.js';
import { sendOTP } from '../../services/user/mailer.js';

// ─── View Profile ─────────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).lean();
        if (!user) return res.redirect('/logout');
        res.render('user/profile/view', { title: 'My Profile', user, activePage: 'profile', query: req.query });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
};

// ─── Edit Profile ─────────────────────────────────────────────────────────────
export const getEditProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).lean();
        if (!user) return res.redirect('/logout');
        res.render('user/profile/edit', {
            title: 'Edit Profile', user, error: null,
            emailMessage: null, activePage: 'profile'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
};

export const postEditProfile = async (req, res) => {
    const user = await User.findById(req.session.user.id).lean();

    const renderEdit = (error) =>
        res.render('user/profile/edit', {
            title: 'Edit Profile', user, error, emailMessage: null, activePage: 'profile'
        });

    try {
        const { firstName, lastName, username, phone, gender } = req.body;

        if (!firstName || !firstName.trim()) return renderEdit('First name cannot be empty.');
        if (!lastName  || !lastName.trim())  return renderEdit('Last name cannot be empty.');
        if (!username  || !username.trim())  return renderEdit('Username cannot be empty.');

        const { genderOther } = req.body;
        const resolvedGender = gender === 'other'
            ? (genderOther && genderOther.trim() ? genderOther.trim() : 'other')
            : gender;

        await User.findByIdAndUpdate(req.session.user.id, {
            firstName: firstName.trim(),
            lastName:  lastName.trim(),
            username:  username.trim(),
            phone,
            gender:    resolvedGender,
        });
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        return renderEdit('Update failed. Please try again.');
    }
};

// ─── Change Password ──────────────────────────────────────────────────────────
export const getChangePassword = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).lean();
        if (!user) return res.redirect('/logout');
        res.render('user/profile/change-password', {
            title: 'Change Password', user, error: null, message: null, activePage: 'password'
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
            title: 'Change Password', user: user.toObject(),
            error, message, activePage: 'password'
        });

    // ── Empty field guards ────────────────────────────────────────────────────
    if (!currentPassword || !currentPassword.trim())
        return renderPage('Current password is required.');
    if (!password || !password.trim())
        return renderPage('New password is required.');
    if (!confirmPassword || !confirmPassword.trim())
        return renderPage('Please confirm your new password.');

    // ── Match check ───────────────────────────────────────────────────────────
    if (password !== confirmPassword)
        return renderPage('New passwords do not match.');

    // ── Current password check ────────────────────────────────────────────────
    const validCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validCurrent) return renderPage('Current password is incorrect.');

    // ── Same-as-current guard ─────────────────────────────────────────────────
    const sameAsCurrent = await bcrypt.compare(password, user.passwordHash);
    if (sameAsCurrent) return renderPage('New password must be different from your current password.');

    // ── Password strength (Zod schema) ────────────────────────────────────────
    try {
        passwordSchema.parse(password);
    } catch (err) {
        const msg = err?.issues?.[0]?.message || err?.errors?.[0]?.message || 'Password does not meet security requirements.';
        return renderPage(msg);
    }

    const hash = await bcrypt.hash(password, 12);
    await User.findByIdAndUpdate(user._id, { passwordHash: hash });
    renderPage(null, 'Password updated successfully!');
};

// ─── Request Email Change (Step 1: send OTP to new email) ────────────────────
export const postRequestEmailChange = async (req, res) => {
    const userId   = req.session.user.id;
    const newEmail = (req.body.newEmail || '').trim().toLowerCase();

    const user = await User.findById(userId).lean();
    const renderEdit = (error, emailMessage = null) =>
        res.render('user/profile/edit', {
            title: 'Edit Profile', user, error, emailMessage, activePage: 'profile'
        });

    // Basic email format validation
    if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail)) {
        return renderEdit(null, 'Please enter a valid email address.');
    }

    // Must be different from current
    if (newEmail === user.email) {
        return renderEdit(null, 'New email is the same as your current email.');
    }

    // Check email not taken by another account
    const existing = await User.findOne({ email: newEmail }).lean();
    if (existing) {
        return renderEdit(null, 'This email is already registered to another account.');
    }

    try {
        // Clear any existing email_change OTPs for safety
        await OTP.deleteMany({ email: newEmail, type: 'email_change' });

        const otp     = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OTP.create({ email: newEmail, otp: otpHash, type: 'email_change', expiresAt });
        await sendOTP(newEmail, otp, 'email_change');

        // Store pending email in session — never trust the form on step 2
        req.session.emailChange = { newEmail, userId };

        console.log(`[profileController] Email change OTP sent to ${newEmail}`);
        return res.redirect('/profile/verify-email-otp');

    } catch (err) {
        console.error('[profileController] Email change OTP error:', err);
        return renderEdit(null, 'Failed to send OTP. Please try again.');
    }
};

// ─── Show Email OTP Verification Page (Step 2) ───────────────────────────────
export const getVerifyEmailOtp = async (req, res) => {
    const session = req.session.emailChange;
    if (!session) return res.redirect('/profile/edit');

    const user = await User.findById(session.userId).lean();

    const record = await OTP.findOne({ email: session.newEmail, type: 'email_change' })
                            .sort({ createdAt: -1 });
    const remainingTime = record?.expiresAt
        ? Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
        : 0;

    res.render('user/profile/verify-email-otp', {
        title: 'Verify New Email',
        newEmail: session.newEmail,
        user,
        error: null,
        message: null,
        remainingTime,
        freshOtp: true,
        activePage: 'profile'
    });
};

// ─── Verify Email OTP and Update Email (Step 3) ───────────────────────────────
export const postVerifyEmailOtp = async (req, res) => {
    const session = req.session.emailChange;
    if (!session) return res.redirect('/profile/edit');

    const { newEmail, userId } = session;
    const otp       = req.body.otp;
    const otpString = Array.isArray(otp) ? otp.join('') : otp;

    const user = await User.findById(userId).lean();

    const renderOtp = async (error, message = null) => {
        const record = await OTP.findOne({ email: newEmail, type: 'email_change' })
                                .sort({ createdAt: -1 });
        const remainingTime = record?.expiresAt
            ? Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
            : 0;
        res.render('user/profile/verify-email-otp', {
            title: 'Verify New Email', newEmail, user,
            error, message, remainingTime, freshOtp: false, activePage: 'profile'
        });
    };

    try {
        const record = await OTP.findOne({ email: newEmail, type: 'email_change' })
                                .sort({ createdAt: -1 });

        if (!record || record.expiresAt < new Date()) {
            return renderOtp('OTP expired. Please request a new one.');
        }

        const isValid = await bcrypt.compare(otpString, record.otp);
        if (!isValid) {
            return renderOtp('Invalid OTP. Please try again.');
        }

        // Check one more time that email is still free (race condition guard)
        const taken = await User.findOne({ email: newEmail }).lean();
        if (taken && taken._id.toString() !== userId) {
            await OTP.deleteMany({ email: newEmail, type: 'email_change' });
            delete req.session.emailChange;
            return renderOtp('This email was just taken by another account. Please try a different one.');
        }

        // All good — update email
        await OTP.deleteMany({ email: newEmail, type: 'email_change' });
        await User.findByIdAndUpdate(userId, { email: newEmail });
        req.session.user.email = newEmail;
        delete req.session.emailChange;

        return res.redirect('/profile?emailUpdated=1');

    } catch (err) {
        console.error('[profileController] verify email OTP error:', err);
        return renderOtp('Something went wrong. Please try again.');
    }
};

export const postUploadProfilePhoto = async (req, res) => {
    try {
        const { imageData } = req.body;
        if (!imageData || !imageData.startsWith('data:')) {
            return res.status(400).json({ ok: false, message: 'No image data received.' });
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/avif', 'image/webp'];
        const mimeMatch = imageData.match(/^data:([^;]+);base64,/);
        const mimeType  = mimeMatch ? mimeMatch[1] : '';

        if (!allowedTypes.includes(mimeType)) {
            return res.status(400).json({ ok: false, message: `Invalid file type "${mimeType || 'unknown'}". Only JPEG, PNG, AVIF, and WebP images are allowed.` });
        }

        // Upload base64 directly to Cloudinary
        const { default: cloudinary } = await import('../../config/cloudinary.js');
        const result = await cloudinary.uploader.upload(imageData, {
            folder:         'comizon/profile_photos',
            transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
            public_id:      `user_${req.session.user.id}`,
            overwrite:      true,
        });

        await User.findByIdAndUpdate(req.session.user.id, { profilePhoto: result.secure_url });

        return res.json({ ok: true, url: result.secure_url });
    } catch (err) {
        console.error('[profileController] upload photo error:', err);
        return res.status(500).json({ ok: false, message: 'Upload failed. Please try again.' });
    }
};

// ─── Resend Email Change OTP ──────────────────────────────────────────────────
export const postResendEmailOtp = async (req, res) => {
    const session = req.session.emailChange;
    if (!session) return res.redirect('/profile/edit');

    const { newEmail, userId } = session;
    const user = await User.findById(userId).lean();

    const renderOtp = async (error, message = null) => {
        const record = await OTP.findOne({ email: newEmail, type: 'email_change' })
                                .sort({ createdAt: -1 });
        const remainingTime = record?.expiresAt
            ? Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
            : 0;
        res.render('user/profile/verify-email-otp', {
            title: 'Verify New Email', newEmail, user,
            error, message, remainingTime, freshOtp: true, activePage: 'profile'
        });
    };

    try {
        await OTP.deleteMany({ email: newEmail, type: 'email_change' });
        const otp     = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        await OTP.create({
            email: newEmail, otp: otpHash, type: 'email_change',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });
        await sendOTP(newEmail, otp, 'email_change');
        renderOtp(null, 'OTP resent successfully.');
    } catch (err) {
        console.error('[profileController] resend email OTP error:', err);
        renderOtp('Failed to resend OTP. Please try again.');
    }
};