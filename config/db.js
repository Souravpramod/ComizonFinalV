import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in the environment variables.');
        }

        const isAtlas = process.env.MONGODB_URI.includes('+srv') || process.env.MONGODB_URI.includes('mongodb.net');

        const options = {
            serverSelectionTimeoutMS: 10000,
            dbName: 'comizon',
        };

        if (isAtlas) {
            options.tls = true;
            options.tlsAllowInvalidCertificates = true;  // ← fixes the SSL alert 80 on Windows
            options.tlsAllowInvalidHostnames = true;      // ← fixes hostname mismatch edge cases
        }

        await mongoose.connect(process.env.MONGODB_URI, options);

        console.log(isAtlas ? '✅ MongoDB Atlas connected' : '✅ MongoDB Local connected');

    } catch (err) {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    }
};

export default connectDB;