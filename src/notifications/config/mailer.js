import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Real SMTP transport (Gmail, SendGrid SMTP relay, or any other provider).
//
// Required env vars:
//   SMTP_HOST               e.g. smtp.gmail.com  /  smtp.sendgrid.net
//   SMTP_PORT               e.g. 587
//   SMTP_SECURE             "true" for port 465, "false" for 587/25
//   SMTP_USER               SMTP username (Gmail address, or "apikey" for SendGrid)
//   SMTP_PASS               SMTP password / app password / API key
//   NOTIFICATIONS_FROM_EMAIL  "From" address shown on outgoing mail
//
// Gmail note: normal account passwords won't work — you need a 16-character
// "App Password" (Google Account > Security > 2-Step Verification > App Passwords).
// SendGrid note: SMTP_USER is literally the string "apikey", SMTP_PASS is your API key.
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

let verified = false;
transporter
    .verify()
    .then(() => {
        verified = true;
        console.log("[notifications] SMTP transport ready.");
    })
    .catch((err) => {
        console.error(
            "[notifications] SMTP transport could not be verified — emails will fail until SMTP_* env vars are set correctly:",
            err.message
        );
    });

export function isMailerReady() {
    return verified;
}

export async function sendMail({ to, subject, text, html }) {
    if (!to) {
        throw new Error("sendMail requires a 'to' address");
    }

    return transporter.sendMail({
        from: process.env.NOTIFICATIONS_FROM_EMAIL || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
    });
}

export default transporter;
