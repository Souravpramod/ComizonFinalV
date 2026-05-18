import nodemailer from 'nodemailer';

let transporter = null;
let initPromise = null;

const initMailer = async () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
            console.log('Using real SMTP server for email.');
        } else {
            console.log('⏳ Initializing Ethereal Email test account...');
            try {
                const testAccount = await nodemailer.createTestAccount();
                transporter = nodemailer.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass,
                    },
                });
                console.log('✅ Ethereal Email test account created successfully.');
                console.warn('WARNING: Using Ethereal Email for OTP. Provide SMTP credentials to use a real mail server.');
            } catch (err) {
               
                console.error('[mailer] Ethereal init failed:', err.message);
                console.warn('[mailer] Email sending will be disabled.');
            }
        }
    })();

    return initPromise;
};

export const sendOTP = async (to, otp, type) => {
    await initMailer();

    if (!transporter) {
        console.error('[mailer] No transporter — skipping email send.');
        
        return true;
    }

    const isSignup = type === 'signup';
    const isEmailChange  = type === 'email_change';

    try {
        const subjects = {
            signup:          'Your Comizon Signup OTP',
            forgot_password: 'Your Comizon Password Reset OTP',
            email_change:    'Your Comizon Email Change OTP',
        };
        const bodies = {
            signup:          `Welcome to Comizon! Your OTP is: ${otp}. Valid for 5 minutes.`,
            forgot_password: `Your password reset OTP is: ${otp}. Valid for 5 minutes.`,
            email_change:    `Your email change OTP is: ${otp}. Valid for 5 minutes. If you did not request this, ignore this email.`,
        };

        const info = await transporter.sendMail({
            from: '"Comizon" <noreply@comizon.com>',
            to,
            subject: subjects[type] || 'Your Comizon OTP',
            html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-top:4px solid #E63946;border-radius:4px;">
        <tr>
          <td style="background-color:#111111;padding:20px 30px;text-align:center;">
            <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:2px;">COMIZON<span style="color:#E63946;">.</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 30px 10px;text-align:center;">
            <p style="margin:0 0 6px;font-size:16px;color:#333333;font-weight:bold;">
              ${isSignup ? 'Welcome to Comizon!' : isEmailChange ? 'Email Change Request' : 'Password Reset Request'}
            </p>
            <p style="margin:0;font-size:14px;color:#555555;">${bodies[type] || bodies.signup}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 30px;text-align:center;">
            <div style="display:inline-block;background-color:#111111;border:2px solid #E63946;border-radius:4px;padding:16px 40px;">
              <span style="font-size:36px;font-weight:900;color:#ffffff;letter-spacing:10px;">${otp}</span>
            </div>
            <p style="margin:16px 0 0;font-size:13px;color:#888888;">This code expires in <strong style="color:#333333;">5 minutes</strong>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 30px 30px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#aaaaaa;">If you didn't request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9f9f9;padding:14px 30px;text-align:center;border-top:1px solid #eeeeee;">
            <p style="margin:0;font-size:11px;color:#aaaaaa;">&copy; 2025 Comizon. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
            text: bodies[type] || bodies.signup,
        });

        if (transporter.options?.host === 'smtp.ethereal.email') {
            const url = nodemailer.getTestMessageUrl(info);
            if (url) {
                console.log(`\n========================================================`);
                console.log(`⚠️  [MOCK EMAIL] OTP was NOT sent to your real inbox!`);
                console.log(`OTP Email Preview URL: ${url}`);
                console.log(`========================================================\n`);
            }
        }

        return true;
    } catch (err) {
        console.error('[mailer] Send failed:', err.message);
        return true;
    }
};