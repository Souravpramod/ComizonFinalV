import multer from 'multer';
import { Readable } from 'stream';
import cloudinary from '../../config/cloudinary.js';

const upload = multer({ storage: multer.memoryStorage() });

export const uploadImage = upload.fields([
    { name: 'image_0', maxCount: 1 },
    { name: 'image_1', maxCount: 1 },
    { name: 'image_2', maxCount: 1 },
]);
export const uploadEditImages = upload.fields([
    { name: 'image_0', maxCount: 1 },
    { name: 'image_1', maxCount: 1 },
    { name: 'image_2', maxCount: 1 },
]);


export const uploadToCloudinary = (buffer, folder = 'comizon/products') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                transformation: [{ width: 600, height: 800, crop: 'limit' }],
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        );
        Readable.from(buffer).pipe(stream);
    });
};