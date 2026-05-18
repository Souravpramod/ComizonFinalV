import session from 'express-session';
import MongoStore from 'connect-mongo';

export const adminSession = (req, res, next) => {
    if (!req.path.startsWith('/admin')) return next();

    return session({
        name: 'admin.sid',
        secret: process.env.ADMIN_SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
            mongoOptions: {
                tls: true,
                tlsAllowInvalidCertificates: true,
                tlsAllowInvalidHostnames: true,
            },
            collectionName: 'admin_sessions',
        }),
        cookie: {
            path: '/admin',
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
        },
    })(req, res, next);
};