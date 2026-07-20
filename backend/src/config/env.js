require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 4000,
  mongodbUrl: process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/bcs_tracker',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || false,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_FROM || 'BCS Tracker <no-reply@example.com>',
  },
  gcs: {
    bucketName: process.env.GCS_BUCKET_NAME || 'sameerv-cow-bcs-images',
    projectId: process.env.GCS_PROJECT_ID || 'sameerv',
    keyFile: process.env.GCS_KEY_FILE || null,
    signedUrlExpiryMs: Number(process.env.GCS_SIGNED_URL_EXPIRY_MS) || 15 * 60 * 1000,
  },
  imageCompressor: {
    url: process.env.IMAGE_COMPRESSOR_URL || null,
  },
};
