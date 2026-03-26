import { z } from 'zod';

export const passwordSchema = z.string()
    .min(1, "Password is required.")
    .min(8, "Password must be at least 8 characters.")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
    .regex(/[0-9]/, "Password must contain at least one number.")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character.");

export const signupSchema = z.object({

    firstName: z.string()
    .trim()
    .min(1, "First name is required.")
    .min(2, "First name must be at least 2 characters.")
    .regex(/^[A-Za-z]+$/, "First name can only contain letters."),

    lastName: z.string()
    .trim()
    .min(1, "Last name is required.")
    .min(2, "Last name must be at least 2 characters.")
    .regex(/^[A-Za-z]+$/, "Last name can only contain letters."),

    username: z.string()
    .trim()
    .min(1, "Username is required.")
    .min(3, "Username must be at least 3 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores."),

    email: z.string()
    .trim()
    .min(1, "Email is required.")
    .email("Please enter a valid email address."),

    phone: z.string()
    .trim()
    .regex(/^[0-9]{7,15}$/, "Phone number must contain 7–15 digits."),

    password: passwordSchema,

    confirmPassword: z.string()
    .min(1, "Please confirm your password."),

    gender: z.enum(['male','female','other'], {
        errorMap: () => ({ message: "Please select a valid gender." })
    }),

    genderOther: z.string().optional(),

    countryCode: z.string().optional()

})
.refine(data => data.password === data.confirmPassword,{
    message:"Passwords do not match.",
    path:["confirmPassword"]
})
.refine(data => {
    if(data.gender === "other"){
        return data.genderOther && data.genderOther.trim().length > 1;
    }
    return true;
},{
    message:"Please specify your gender.",
    path:["genderOther"]
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
});

export const loginSchema = z.object({
    email: z.string().trim().email("Please enter a valid email address."),
    password: z.string().min(1, "Password is required.")
});

export const formatZodErrors = (error) => {
    const fieldErrors = {};

    if (error && error.issues) {
        error.issues.forEach(issue => {
            if (issue.path && issue.path.length > 0) {
                const field = issue.path[0];

                if (!fieldErrors[field]) {
                    fieldErrors[field] = issue.message;
                }
            }
        });
    }

    return fieldErrors;
};

export const getPasswordCriteriaErrors = (password) => {
    return [
        { label: 'At least 8 characters', passed: password.length >= 8 },
        { label: 'At least one letter', passed: /[a-zA-Z]/.test(password) },
        { label: 'At least one number', passed: /[0-9]/.test(password) },
        { label: 'At least one special character', passed: /[^a-zA-Z0-9]/.test(password) },
    ];
};