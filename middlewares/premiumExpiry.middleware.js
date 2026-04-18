
import User from '../models/Users.js';

async function runExpiryCheck() {
    try {
        const result = await User.updateMany(
            {
                isPremium:        true,
                premiumExpiresAt: { $lt: new Date() },
            },
            {
                $set: {
                    isPremium:        false,
                    premiumPlan:      null,
                    premiumExpiresAt: null,
                }
            }
        );
        if (result.modifiedCount > 0) {
            console.log(`[PremiumExpiry] Demoted ${result.modifiedCount} expired premium user(s)`);
        }
    } catch (err) {
        console.error('[PremiumExpiry] Error:', err.message);
    }
}

export function startPremiumExpiryJob() {
    runExpiryCheck();                             
    setInterval(runExpiryCheck, 60 * 60 * 1000);  
}