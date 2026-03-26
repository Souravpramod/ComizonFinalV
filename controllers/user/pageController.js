
import { IMG} from '../../utils/constants.js';
import { renderListingPage } from './listingHelper.js';

export const getHome = (req, res) => {
    return renderListingPage(
        req,
        res,
        'home',
        'user/home',
        IMG.heroHome
    );
};

export const getAmerican = (req, res) => {
    return renderListingPage(
        req,
        res,
        'american',
        'user/american',
        IMG.heroAmerican
    );
};

export const getManga = (req, res) => {
    return renderListingPage(
        req,
        res,
        'manga',
        'user/manga',
        IMG.heroManga
    );
};
export const getToys = (req, res) => {
    return renderListingPage(
        req,
        res,
        'toys',
        'user/toys',
        IMG.heroToys
    );
};


export const getPremium = (req, res) => {

    const user = req.session.user;

    
    if (!user) {
        return res.render('user/premiumLanding', { title: 'Premium' });
    }

    
    if (!user.isPremium) {
        return res.render('user/premiumLanding', { title: 'Premium' });
    }

    
    return renderListingPage(
        req,
        res,
        'premium',
        'user/premiumPortal',
        IMG.heroPremium
    );
};