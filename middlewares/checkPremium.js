

import User from '../models/Users.js';

const checkPremium = async (req, res, next) => {

    if (!req.session?.user?.id) return next();

    try {

        const user = await User.findById(req.session.user.id)
            .select('isPremium premiumPlan premiumExpiresAt')
            .lean();

        if (!user) return next(); 

        const now = new Date();
        const naturallyExpired  = user.premiumExpiresAt && now > new Date(user.premiumExpiresAt);
        const adminRevoked      = !user.isPremium; 

        if (naturallyExpired || adminRevoked) {

            if (user.isPremium || user.premiumPlan || user.premiumExpiresAt) {
                await User.findByIdAndUpdate(req.session.user.id, {
                    isPremium:        false,
                    premiumPlan:      null,
                    premiumExpiresAt: null,
                });
            }

           
            req.session.user.isPremium = false;
        } else {
            
            req.session.user.isPremium = user.isPremium;
        }

    } catch (err) {
      
        console.error('checkPremium middleware error:', err.message);
    }

    return next();
};

export default checkPremium;
