import 'dotenv/config';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from 'express';
import connectDB from './config/db.js';
import MongoStore from 'connect-mongo';
import session from 'express-session';
import userRoutes from './routes/user/userRoutes.js';
import adminRoutes from './routes/admin/adminRoutes.js';
import { injectSessionLocals } from './middlewares/sessionLocals.middleware.js';
import { nocache } from './middlewares/nocache.middleware.js';
import passport from 'passport';
import methodOverride from 'method-override';

 // reads ?_method=PATCH from query string

await import('./config/passport.js');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(methodOverride('_method'));
connectDB();

app.use((req, res, next) => {
    if (!req.path.startsWith('/admin')) {
        return session({
            name: 'user.sid',
            secret: process.env.USER_SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            store: MongoStore.create({
                mongoUrl: process.env.MONGODB_URI,
                collectionName: 'user_sessions'
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24,
                httpOnly: true,
                secure: false,
                sameSite: 'lax'
            }
        })(req, res, next);
    }
    next();
});

app.use((req, res, next) => {
    if (req.path.startsWith('/admin')) {
        return session({
            name: 'admin.sid',
            secret: process.env.ADMIN_SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            store: MongoStore.create({
                mongoUrl: process.env.MONGODB_URI,
                collectionName: 'admin_sessions'
            }),
            cookie: {
                path: '/admin',
                maxAge: 1000 * 60 * 60 * 24,
                httpOnly: true,
                secure: false,
                sameSite: 'lax'
            }
        })(req, res, next);
    }
    next();
});

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(injectSessionLocals);
app.use(nocache);

app.use('/', userRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {

    let backLink = "/";
    let backText = "← Back to Home";
    let color = "#E63946";

    if (req.originalUrl.startsWith('/admin')) {
        backLink = "/admin/dashboard";
        backText = "← Back to Dashboard";
        color = "#e6c200";
    }

    res.status(404).send(`
    <div style="background:#000;color:#fff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Anton,sans-serif;">
      <h1 style="font-size:6rem;color:${color};margin:0;">404</h1>
      <p style="color:#aaa;">Page not found</p>
      <a href="${backLink}" style="color:${color};text-decoration:none;font-size:1.1rem;">${backText}</a>
    </div>`);
});

app.listen(PORT, () => {
    console.log(`\nUser Panel  → http://localhost:${PORT}`);
    console.log(`Admin Panel → http://localhost:${PORT}/admin/login\n`);
});

export default app;