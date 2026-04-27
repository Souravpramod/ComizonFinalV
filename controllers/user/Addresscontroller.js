import User from '../../models/Users.js';

const GEOAPIFY_KEY = 'b09bff8571104f748963424f37336206';

async function validatePincodeWithGeoapify(pincode, country) {
    try {
        const query = encodeURIComponent(`${pincode.trim()} ${country.trim()}`);
        const url   = `https://api.geoapify.com/v1/geocode/search?text=${query}&filter=countrycode:${getCountryCode(country)}&apiKey=${GEOAPIFY_KEY}`;
        const res   = await fetch(url, { signal: AbortSignal.timeout(5000) });

        if (!res.ok) {
            console.warn('Geoapify returned', res.status, '— failing open');
            return true;
        }

        const data     = await res.json();
        const features = data?.features;
        if (!features || features.length === 0) return false;

        const submitted = pincode.trim().toLowerCase().replace(/\s+/g, '');
        return features.some(f => {
            const returned = (f.properties?.postcode || '').toLowerCase().replace(/\s+/g, '');
            
            return returned === submitted || returned.startsWith(submitted);
        });
    } catch (err) {
        console.error('Geoapify pincode validation error:', err.message);
        return true; 
    }
}


function getCountryCode(country) {
    const map = {
        'india': 'in', 'united states': 'us', 'usa': 'us', 'us': 'us',
        'united kingdom': 'gb', 'uk': 'gb', 'canada': 'ca',
        'australia': 'au', 'germany': 'de', 'france': 'fr',
        'singapore': 'sg', 'uae': 'ae', 'united arab emirates': 'ae',
        'bangladesh': 'bd', 'pakistan': 'pk', 'sri lanka': 'lk', 'nepal': 'np',
    };
    return map[country.trim().toLowerCase()] || 'auto';
}


export const validatePincodeApi = async (req, res) => {
    const { pincode, country } = req.query;
    if (!pincode || !country)
        return res.json({ valid: false, message: 'Pincode and country are required.' });

    const valid = await validatePincodeWithGeoapify(pincode, country);
    return res.json({
        valid,
        message: valid
            ? 'Valid postal code.'
            : `"${pincode}" does not appear to be a valid postal code for ${country}. Please double-check.`,
    });
};

function validateAddressFields({ type, addressLane1, city, state, country, pincode }) {
    const errors = {};

    const validTypes = ['home', 'work', 'other'];
    if (!type || !validTypes.includes(type)) {
        errors.type = 'Please select a valid address type.';
    }

    if (!addressLane1 || addressLane1.trim().length < 5) {
        errors.addressLane1 = 'Address Line 1 must be at least 5 characters.';
    }

    if (!city || city.trim().length < 2) {
        errors.city = 'City is required.';
    } else if (!/^[a-zA-Z\s\-'.]+$/.test(city.trim())) {
        errors.city = 'City must contain only letters.';
    }

    if (state && state.trim() !== '' && !/^[a-zA-Z\s\-'.]+$/.test(state.trim())) {
        errors.state = 'State must contain only letters.';
    }

    if (country && country.trim() !== '' && !/^[a-zA-Z\s\-'.]+$/.test(country.trim())) {
        errors.country = 'Country must contain only letters.';
    }

    if (!pincode || pincode.trim() === '') {
        errors.pincode = 'Pincode is required.';
    } else if (!country || country.trim() === '') {
        errors.pincode = 'Please enter a country so we can validate the pincode.';
    }
  

    return errors;
}

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
            formErrors: {},
            formData: {},
            openEditId: null,
            activePage: 'addresses'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
};



export const postAddAddress = async (req, res) => {
    const { type, addressLane1, addressLane2, city, state, country, pincode } = req.body;

    const errors = validateAddressFields({ type, addressLane1, city, state, country, pincode });

    
    if (!errors.pincode && pincode && country) {
        const pincodeValid = await validatePincodeWithGeoapify(pincode, country);
        if (!pincodeValid) {
            errors.pincode = `"${pincode}" does not appear to be a valid postal code for ${country.trim()}. Please double-check.`;
        }
    }

    if (Object.keys(errors).length > 0) {
        try {
            const user = await User.findById(req.session.user.id).lean();
            if (!user) return res.redirect('/logout');

            return res.render('user/address/manage', {
                title: 'Manage Addresses',
                user,
                addresses: user.addresses || [],
                success: null,
                error: null,
                formErrors: { add: errors },
                formData: { add: req.body },
                openEditId: null,
                activePage: 'addresses'
            });
        } catch (err) {
            console.error(err);
            return res.redirect('/profile/address');
        }
    }

    try {
        const user = await User.findById(req.session.user.id).lean();
        const isFirst = !user.addresses || user.addresses.length === 0;

        await User.findByIdAndUpdate(
            req.session.user.id,
            {
                $push: {
                    addresses: {
                        type,
                        addressLane1: addressLane1.trim(),
                        addressLane2: addressLane2?.trim() || '',
                        city: city.trim(),
                        state: state?.trim() || '',
                        country: country?.trim() || '',
                        pincode: pincode.trim(),
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
    const { type, addressLane1, addressLane2, city, state, country, pincode } = req.body;
    const editId = req.params.id;

    const errors = validateAddressFields({ type, addressLane1, city, state, country, pincode });

    
    if (!errors.pincode && pincode && country) {
        const pincodeValid = await validatePincodeWithGeoapify(pincode, country);
        if (!pincodeValid) {
            errors.pincode = `"${pincode}" does not appear to be a valid postal code for ${country.trim()}. Please double-check.`;
        }
    }

    if (Object.keys(errors).length > 0) {
        try {
            const user = await User.findById(req.session.user.id).lean();
            if (!user) return res.redirect('/logout');

            return res.render('user/address/manage', {
                title: 'Manage Addresses',
                user,
                addresses: user.addresses || [],
                success: null,
                error: null,
                formErrors: { edit: errors },
                formData: { edit: req.body },
                openEditId: editId,
                activePage: 'addresses'
            });
        } catch (err) {
            console.error(err);
            return res.redirect('/profile/address');
        }
    }

    try {
        await User.findOneAndUpdate(
            { _id: req.session.user.id, 'addresses._id': editId },
            {
                $set: {
                    'addresses.$.type':         type,
                    'addresses.$.addressLane1': addressLane1.trim(),
                    'addresses.$.addressLane2': addressLane2?.trim() || '',
                    'addresses.$.city':         city.trim(),
                    'addresses.$.state':        state?.trim() || '',
                    'addresses.$.country':      country?.trim() || '',
                    'addresses.$.pincode':      pincode.trim(),
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


export const postAddAddressAjax = async (req, res) => {
    if (!req.session?.user?.id)
        return res.status(401).json({ ok: false, message: 'Login required' });

    const { type, addressLane1, addressLane2, city, state, pincode, country } = req.body;

  
    const errors = {};
    if (!addressLane1 || addressLane1.trim().length < 5)
        errors.addressLane1 = 'Address Line 1 must be at least 5 characters.';
    if (!city || city.trim().length < 2)
        errors.city = 'City is required.';
    if (!pincode || pincode.trim() === '')
        errors.pincode = 'Pincode is required.';
    if (!country || country.trim() === '')
        errors.country = 'Country is required.';

    if (Object.keys(errors).length > 0)
        return res.status(400).json({ ok: false, errors });


    const pincodeValid = await validatePincodeWithGeoapify(pincode, country);
    if (!pincodeValid) {
        return res.status(400).json({
            ok: false,
            errors: { pincode: `"${pincode.trim()}" does not appear to be a valid postal code for ${country.trim()}.` }
        });
    }

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(401).json({ ok: false, message: 'User not found' });

        const isFirst = !user.addresses || user.addresses.length === 0;
        user.addresses.push({
            type: type || 'home',
            addressLane1: addressLane1.trim(),
            addressLane2: addressLane2?.trim() || '',
            city: city.trim(),
            state: state?.trim() || '',
            pincode: pincode.trim(),
            country: country.trim(),
            isDefault: isFirst
        });
        await user.save();
        const saved = user.addresses[user.addresses.length - 1];
        return res.json({ ok: true, address: saved.toObject() });
    } catch (err) {
        console.error('postAddAddressAjax error:', err);
        return res.status(500).json({ ok: false, message: 'Failed to save address. Please try again.' });
    }
};