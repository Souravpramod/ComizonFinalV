import express from 'express';

import {
    getLogin,
    postLogin,
    getDashboard,
    logout,
} from '../../controllers/admin/adminAuthController.js';

import {
    getUsers,
    postToggleBlock,
    createUser,
    updateUser,
    deleteUser,
    viewUser
} from '../../controllers/admin/adminUserController.js';

import {
    getProducts,
    addProduct,
    getEditProduct,
    updateProduct,
    deleteProduct,
    activateProduct
} from '../../controllers/admin/productController.js';

import {
    getCategories,
    addCategory,
    getEditCategory,
    editCategory,
    deleteCategory,
    toggleCategoryStatus
} from '../../controllers/admin/categoryController.js';

import {
 getPageSettings,
 updatePageSettings
} from "../../controllers/admin/pageSettingsController.js";

import { isAdminAuthenticated } from '../../middlewares/admin/adminAuth.middleware.js';
import { uploadImage, uploadEditImages } from '../../middlewares/admin/upload.js';

const router = express.Router();


// Disable caching
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Prevent login if already logged in
const noAdminFallback = (req, res, next) => {
    if (req.session && req.session.adminAuth) {
        return res.redirect('/admin/dashboard');
    }
    next();
};


// ───────── AUTH ROUTES ─────────
router.get('/login', noAdminFallback, getLogin);
router.post('/login', noAdminFallback, postLogin);
router.get('/logout', logout);


// ───────── PROTECTED ROUTES ─────────
router.use(isAdminAuthenticated);

// Dashboard
router.get('/dashboard', getDashboard);


// ───────── USERS ─────────
router.get('/users', getUsers);
router.get('/users/view/:id', viewUser);
router.post('/users', createUser);
router.post('/users/update/:id', updateUser);
router.post('/users/delete/:id', deleteUser);
router.post('/users/toggle-block/:id', postToggleBlock);


// ───────── PRODUCTS ─────────

router.get('/products', getProducts);
router.post('/products/add', uploadImage, addProduct);
router.get('/products/edit/:id', getEditProduct);
router.post('/products/edit/:id', uploadEditImages, updateProduct);
router.patch('/products/delete/:id', deleteProduct);
router.patch('/products/:id/activate',activateProduct);


// ───────── CATEGORIES ─────────
router.get('/categories', getCategories);
router.post('/categories/add', addCategory);
router.get('/categories/edit/:id', getEditCategory);
router.post('/categories/edit/:id', editCategory);
router.post('/categories/delete/:id', deleteCategory);
router.post('/categories/toggle-status/:id', toggleCategoryStatus);


router.get("/pgSettings", getPageSettings);
router.post("/pgSettings", updatePageSettings);


export default router;