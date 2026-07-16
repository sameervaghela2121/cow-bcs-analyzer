require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 4000,
  mongodbUrl: process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/bcs_tracker',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  aiBackendUrl: process.env.AI_BACKEND_URL || 'http://localhost:8000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'BCS Tracker <no-reply@example.com>',
  },
  uploadDir: process.env.UPLOAD_DIR || './uploads',
};
