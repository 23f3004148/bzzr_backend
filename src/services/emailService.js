const nodemailer = require('nodemailer');

// Email sending service. Reads SMTP configuration from environment variables.
// The following environment variables should be set:
// SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM (optional)

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('SMTP configuration incomplete; emails will not be sent');
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  if (!tx) {
    console.warn('sendMail called but SMTP transporter is not configured');
    return;
  }
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER;
  const mailOpts = {
    from,
    to,
    subject,
    text,
    html,
  };
  try {
    await tx.sendMail(mailOpts);
  } catch (err) {
    console.error('Failed to send email', err);
  }
}

async function sendRegistrationEmail(user) {
  if (!user || !user.email) return;
  const to = user.email;
  const loginId = user.loginId;
  const subject = 'Welcome to Buuzzer - Your User ID';
  const text = `Hello ${user.name || ''},\n\nThank you for signing up on Buuzzer.\nYour unique ID is: ${loginId}.\n\nPlease keep this ID safe for login.\n\nRegards,\nBuuzzer Team`;
  const html = `<p>Hello ${user.name || ''},</p><p>Thank you for signing up on <strong>Buuzzer</strong>.</p><p>Your unique ID is: <strong>${loginId}</strong></p><p>Please keep this ID safe for login.</p><p>Regards,<br/>Buuzzer Team</p>`;
  await sendMail({ to, subject, text, html });
}

async function sendPasswordResetEmail(user, token) {
  if (!user || !user.email) return;
  const to = user.email;
  const subject = 'Buuzzer Password Reset';
  const baseUrl =
    process.env.FRONTEND_URL ||
    (process.env.FRONTEND_ORIGIN || '').split(',')[0]?.trim() ||
    'http://localhost:5173';
  const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(
    user._id
  )}`;
  const text = `Hello ${user.name || ''},\n\nYou requested a password reset.\nClick the link below to set a new password:\n${link}\n\nIf you did not request this reset, please ignore this email.\n\nRegards,\nBuuzzer Team`;
  const html = `<p>Hello ${user.name || ''},</p><p>You requested a password reset.</p><p>Click the link below to set a new password:</p><p><a href="${link}">${link}</a></p><p>If you did not request this reset, please ignore this email.</p><p>Regards,<br/>Buuzzer Team</p>`;
  await sendMail({ to, subject, text, html });
}

module.exports = {
  sendRegistrationEmail,
  sendPasswordResetEmail,
};
