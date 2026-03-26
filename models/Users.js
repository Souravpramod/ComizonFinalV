import mongoose from 'mongoose';


const addressSchema = new mongoose.Schema({
    type:         { type: String },
    addressLane1: { type: String },
    addressLane2: { type: String },
    city:         { type: String },
    state:        { type: String },
    pincode:      { type: String },
    country:      { type: String },
    isDefault:    { type: Boolean, default: false },
    couponId:     { type: String },
    paymentId:    { type: mongoose.Schema.Types.ObjectId },
});


const userSchema = new mongoose.Schema({
    firstName:    { type: String, default: '' },
    lastName:     { type: String, default: '' },
    username:     { type: String },
    email:        { type: String, required: true, unique: true },
    passwordHash: { type: String },   
    gender:       {type:String},
    googleId:     { type: String },   
    phone:        { type: String },
    role:         { type: String, default: 'user' },
    isActive:     { type: Boolean, default: true },
    isBlocked:    { type: Boolean, default: false },
    isPremium:    { type: Boolean, default: false },
    addresses:    [addressSchema],
    createdAt:    { type: Date, default: Date.now },
    lastLogin:    { type: Date },
    items:        [{ type: mongoose.Schema.Types.ObjectId }],
    couponId:     { type: String },
    paymentId:    { type: mongoose.Schema.Types.ObjectId },
    productId:    { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: false });

const User = mongoose.model('Users', userSchema);

export default User;