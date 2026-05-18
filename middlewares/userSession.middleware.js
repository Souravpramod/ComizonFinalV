import session from 'express-session';
import MongoStore from 'connect-mongo';

export const userSession = (req, res, next) => {
    if (req.path.startsWith('/admin')) return next();

    return session({
        name: 'user.sid',
        secret: process.env.USER_SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
           
            mongoOptions: {
                tls: true,
                tlsAllowInvalidCertificates: true,
                tlsAllowInvalidHostnames: true,
            },
            collectionName: 'user_sessions',
        }),
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
        },
    })(req, res, next);
};