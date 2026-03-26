import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/Users.js';

passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  '/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;

        let user = await User.findOne({ email });

        if (!user) {
            const firstName = profile.name.givenName  || email.split('@')[0];
            const lastName  = profile.name.familyName || '';

            user = await User.create({
                firstName,
                lastName,
                email,
                username: email.split('@')[0],
                googleId: profile.id,   
                role:     'user',
                isActive: true,
            });
        } else if (!user.googleId) {
            
            await User.findByIdAndUpdate(user._id, { googleId: profile.id });
        }

        return done(null, user);

    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});