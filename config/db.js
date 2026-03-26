import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in the environment variables.');
        }

        const options = { serverSelectionTimeoutMS: 10000 };
        if (process.env.MONGODB_URI.includes('+srv')) {
            options.tls = true;
            options.tlsAllowInvalidCertificates = true;
        }

       
        options.dbName = 'comizon';

        await mongoose.connect(process.env.MONGODB_URI, options);
        console.log('MongoDB Atlas connected');
    } catch (err) {
        console.error('MongoDB connection failed:', err.message);

    }
};

export default connectDB;