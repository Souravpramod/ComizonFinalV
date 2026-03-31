import bcrypt from 'bcrypt';
import User from '../../models/Users.js';
import OTP from '../../models/OTP.js';
import { sendOTP } from '../../services/user/mailer.js';
import {
    signupSchema,
    loginSchema,
    passwordSchema,
    formatZodErrors,
    getPasswordCriteriaErrors,
} from '../../utils/validators.js';



export const getLogin = (req, res) =>
    res.render('user/login', { title: 'Login', error: null, formData: {} });

export const getSignup = (req, res) =>
    res.render('user/signup', {
        title: 'Sign Up',
        error: null,
        fieldErrors: {},
        passwordCriteria: getPasswordCriteriaErrors(''),
        formData: {},
    });

export const getForgotPassword = (req, res) =>
    res.render('user/forgot-password', { title: 'Forgot Password', error: null, message: null });
passwordSchema
export const getResetPassword = (req, res) => {
    if (!req.query.email) return res.redirect('/forgot-password');
    res.render('user/reset-password', {
        title: 'Reset Password',
        email: req.query.email,
        error: null,
        passwordCriteria: getPasswordCriteriaErrors(''),
    });
};

export const getVerifyOtp = async (req, res) => {
    const otpSession = req.session.otp;

    if (!otpSession) return res.redirect('/signup');

    try {
        const record = await OTP
            .findOne({ email: otpSession.email, type: otpSession.type })
            .sort({ createdAt: -1 });

        const remainingTime = record?.expiresAt
            ? Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
            : 0;

        res.render('user/otp-verification', {
            title: 'Verify OTP',
            email: otpSession.email,
            type: otpSession.type,
            error: null,
            message: null,
            remainingTime ,
            freshOtp: true
        });

    } catch (err) {
        console.error(err);
        res.redirect('/signup');
    }
};



export const postSignup = async (req, res) => {
    const formData = req.body;

    const renderSignup = (error, fieldErrors = {}, passwordCriteria = null) =>
        res.render('user/signup', {
            title: 'Sign Up',
            error,
            fieldErrors,
            passwordCriteria: passwordCriteria || getPasswordCriteriaErrors(formData.password || ''),
            formData,
        });

    try {
       
        const data = signupSchema.parse(formData);

      
        const existingEmailUser = await User.findOne({ email: data.email.toLowerCase() });
        if (existingEmailUser) {
            if (!existingEmailUser.isActive) {
                
                await User.findByIdAndDelete(existingEmailUser._id);
                await OTP.deleteMany({ email: data.email.toLowerCase(), type: 'signup' });
            } else {
            return renderSignup(
                'An account with this email already exists. Try logging in instead.'
            );
        }
        }



        const usernameExists = await User.findOne({ username: data.username });
        if (usernameExists) {
            if (!usernameExists.isActive) {
               
                await User.findByIdAndDelete(usernameExists._id);
            } else {
            return renderSignup(
                'This username is already taken. Please choose another.'
            );
            }
        }

        const passwordHash = await bcrypt.hash(data.password, 12);

        
        const addresses = [];
        const hasAddress = formData.address1 || formData.city || formData.state || formData.country || formData.pincode;
        if (hasAddress) {
            addresses.push({
                type: 'home',
                addressLane1: formData.address1 || '',
                addressLane2: formData.address2 || '',
                city: formData.city || '',
                state: formData.state || '',
                country: formData.country || '',
                pincode: formData.pincode || '',
                isDefault: true,
            });
        }

        const newUser = await User.create({
            firstName: data.firstName,
            lastName: data.lastName,
            username: data.username,
            email: data.email.toLowerCase(),
            passwordHash,
            gender:data.gender,
            phone: (data.countryCode || '') + data.phone,
            role: 'user',
            isActive: false,
            addresses,
        });

        

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);

        console.log(`[authController]  OTP Generated for signup: ${newUser.email}`);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); 
        await OTP.create({ email: newUser.email, otp: otpHash, type: 'signup', expiresAt });

        await sendOTP(newUser.email, otp, 'signup');
        console.log(`[authController]  OTP Email Sent for signup: ${newUser.email}`);


        req.session.otp = {
            email: newUser.email,
            type: 'signup'
        };

        res.redirect('/verify-otp');

    } catch (err) {
        if (err.name === 'ZodError') {
            const fieldErrors = formatZodErrors(err);
            return renderSignup(
                null,
                fieldErrors,
                getPasswordCriteriaErrors(formData.password || '')
            );
        }
        console.error(err);
        renderSignup('Something went wrong. Please try again.');
    }
};


export const postLogin = async (req, res) => {
    const { email, password } = req.body;

    const renderLogin = (error, fieldErrors = {}) =>
        res.render('user/login', {
            title: 'Login',
            error,
            fieldErrors,
            formData: { email: email || '' },
        });

    
    const fieldErrors = {};
    if (!email || !email.trim())       fieldErrors.email    = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) fieldErrors.email = 'Enter a valid email address.';
    if (!password || !password.trim()) fieldErrors.password = 'Password is required.';

    if (Object.keys(fieldErrors).length > 0) {
        return renderLogin(null, fieldErrors);
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.isActive) {
            return renderLogin('Invalid credentials.');
        }

        if (user.isBlocked) {
            return res.redirect('/blocked');
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return renderLogin('Invalid credentials.');
        }

        if (user.role === 'admin') {
            req.session.admin = { id: user._id, email: user.email, role: 'admin' };
            delete req.session.user;
            await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
            return res.redirect('/admin/dashboard');
        } else {
            req.session.user = { id: user._id, email: user.email, role: 'user', isPremium: user.isPremium };
            delete req.session.admin;
            await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
            return res.redirect('/');
        }

    } catch {
        return renderLogin('Something went wrong. Please try again.');
    }
};



export const postVerifyOtp = async (req, res) => {
    const { otp } = req.body;
    const otpSession = req.session.otp;

    if (!otpSession) return res.redirect('/signup');

    const { email, type } = otpSession;
    const otpString = Array.isArray(otp) ? otp.join('') : otp;

    const renderOtp = async (error, message = null) => {
        const record = await OTP.findOne({ email, type }).sort({ createdAt: -1 });
        const remainingTime = record?.expiresAt
            ? Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
            : 0;

        res.render('user/otp-verification', {
            title: 'Verify OTP',
            email,
            type,
            error,
            message,
            remainingTime,
            freshOtp: false
        });
    };
    try {
        const record = await OTP.findOne({ email, type }).sort({ createdAt: -1 });

        
        if (!record || record.expiresAt < new Date()) {
            return renderOtp('OTP expired. Please request a new one.');
        }

        
        const isValid = await bcrypt.compare(otpString, record.otp);
        if (!isValid) {
            return renderOtp('Invalid OTP. Please try again.');
        }

       
        await OTP.deleteMany({ email, type });
        delete req.session.otp;

        if (type === 'signup') {
            await User.findOneAndUpdate({ email }, { isActive: true });
            return res.redirect('/login');
        }

        if (type === 'forgot_password') {
            req.session.reset = { email };
            delete req.session.otp;
            return res.redirect('/change-password');
        }

    } catch (err) {
        console.error(err);
        renderOtp('Something went wrong. Please try again.');
    }
};



export const postResendOtp = async (req, res) => {
    const otpSession = req.session.otp;

    if (!otpSession) return res.redirect('/signup');

    const { email, type } = otpSession;

    const renderOtp = async (error, message = null) => {
        const record = await OTP.findOne({ email, type }).sort({ createdAt: -1 });
        const remainingTime = record?.expiresAt
            ? Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
            : 0;

        res.render('user/otp-verification', {
            title: 'Verify OTP',
            email,
            type,
            error,
            message,
            remainingTime,
            freshOtp: true
        });
    };

    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);

        console.log(`[authController]  OTP Generated for resend (${type}): ${email}`);
        await OTP.deleteMany({ email, type }); 
        await OTP.create({
            email,
            otp: otpHash,
            type,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000) 
        });
        await sendOTP(email, otp, type);
        console.log(`[authController]  OTP Email Sent for resend (${type}): ${email}`);


        renderOtp(null, 'OTP resent successfully.');
    } catch (err) {
        console.error(err);
        renderOtp('Failed to resend OTP. Please try again.');
    }
};



export const postForgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.render('user/forgot-password', {
                title: 'Forgot Password',
                error: 'This email is not registered. Please create a new account.',
                message: null,
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);

        await OTP.deleteMany({ email: email.toLowerCase(), type: 'forgot_password' }); 
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await OTP.create({ email: email.toLowerCase(), otp: otpHash, type: 'forgot_password', expiresAt });
        await sendOTP(email.toLowerCase(), otp, 'forgot_password');

        req.session.otp = {
            email: email.toLowerCase(),
            type: 'forgot_password'
        };

        return res.redirect('/verify-otp');

    } catch (err) {
        console.error(err);
        res.render('user/forgot-password', {
            title: 'Forgot Password',
            error: 'Something went wrong. Please try again.',
            message: null,
        });
    }
};



export const postResetPassword = async (req, res) => {
    const { email, password, confirmPassword } = req.body;

    const renderReset = (error) =>
        res.render('user/reset-password', {
            title: 'Reset Password',
            email,
            error,
            passwordCriteria: getPasswordCriteriaErrors(password || ''),
        });

    if (password !== confirmPassword) {
        return renderReset('Passwords do not match.');
    }

    try {
        signupSchema.pick({ password: true }).parse({ password });

        const hash = await bcrypt.hash(password, 12);
        await User.findOneAndUpdate({ email: email.toLowerCase() }, { passwordHash: hash });

        res.redirect('/login');

    } catch {
        renderReset('Password does not meet security requirements.');
    }
};


export const getfChangePassword = (req, res) => {
    const resetSession = req.session.reset;
    if (!resetSession?.email) return res.redirect('/forgot-password');
    res.render('user/change-password', {
        title: 'Change Password',
        email: resetSession.email,
        error: null,
        passwordCriteria: getPasswordCriteriaErrors(''),
    });
};

export const postfChangePassword = async (req, res) => {
    const { email, password, confirmPassword } = req.body;


    if (!req.session.reset?.email || req.session.reset.email !== email?.toLowerCase()) {
        return res.redirect('/forgot-password');
    }

    const renderChange = (error) =>
        res.render('user/change-password', {
            title: 'Change Password',
            email,
            error,
            passwordCriteria: getPasswordCriteriaErrors(password || ''),
        });

    if (password !== confirmPassword) {
        return renderChange('Passwords do not match.');
    }

    try {
        passwordSchema.parse(password);

        const hash = await bcrypt.hash(password, 12);

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return renderChange('Something went wrong. Please try again.');

        await User.findByIdAndUpdate(user._id, { passwordHash: hash, lastLogin: new Date() });


        delete req.session.reset;

        req.session.user = {
            id: user._id,
            email: user.email,
            role: 'user',
            isPremium: user.isPremium,
        };

        res.redirect('/');

    } catch (err) {
        if (err.name === 'ZodError') {
            const msg = err.issues?.[0]?.message || 'Password does not meet the security requirements.';
            return renderChange(msg);
        }
        
        renderChange(err.message || 'Something went wrong. Please try again.');
    }
};


export const getLogout = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('user.sid');
        res.redirect('/');
    });
};