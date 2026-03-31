import User from '../../models/Users.js';



export const getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).lean();
        if (!user) return res.redirect('/logout');

        res.render('user/address/manage', {
            title: 'Manage Addresses',
            user,
            addresses: user.addresses || [],
            success: null,
            error: null,
            activePage: 'addresses'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
};



export const postAddAddress = async (req, res) => {
    try {
        const { type, addressLane1, addressLane2, city, state, country, pincode } = req.body;

        const user = await User.findById(req.session.user.id).lean();
        const isFirst = !user.addresses || user.addresses.length === 0;

        await User.findByIdAndUpdate(
            req.session.user.id,
            {
                $push: {
                    addresses: {
                        type,
                        addressLane1,
                        addressLane2,
                        city,
                        state,
                        country,
                        pincode,
                        isDefault: isFirst
                    }
                }
            }
        );
    } catch (err) {
        console.error(err);
    }

    res.redirect('/profile/address');
};



export const postEditAddress = async (req, res) => {
    try {
        const { type, addressLane1, addressLane2, city, state, country, pincode } = req.body;

        await User.findOneAndUpdate(
            { _id: req.session.user.id, 'addresses._id': req.params.id },
            {
                $set: {
                    'addresses.$.type':         type,
                    'addresses.$.addressLane1': addressLane1,
                    'addresses.$.addressLane2': addressLane2,
                    'addresses.$.city':         city,
                    'addresses.$.state':        state,
                    'addresses.$.country':      country,
                    'addresses.$.pincode':      pincode,
                }
            }
        );
    } catch (err) {
        console.error(err);
    }

    res.redirect('/profile/address');
};



export const postDeleteAddress = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.session.user.id, {
            $pull: { addresses: { _id: req.params.id } }
        });
    } catch (err) {
        console.error(err);
    }

    res.redirect('/profile/address');
};



export const postDefaultAddress = async (req, res) => {
    try {
       
        await User.findByIdAndUpdate(req.session.user.id, {
            $set: { 'addresses.$[].isDefault': false }
        });

        await User.findOneAndUpdate(
            { _id: req.session.user.id, 'addresses._id': req.params.id },
            { $set: { 'addresses.$.isDefault': true } }
        );
    } catch (err) {
        console.error(err);
    }

    res.redirect('/profile/address');
};