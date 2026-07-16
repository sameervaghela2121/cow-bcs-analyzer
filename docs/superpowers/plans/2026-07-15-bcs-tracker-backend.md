# BCS Tracker Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Node/Express/MongoDB backend for BCS Tracker — auth, cow/herd management, async photo-upload scoring via the existing `ai-backend` FastAPI service, review queue, and audit log.

**Architecture:** Layered Express app (`routes -> controllers -> services -> models`). MongoDB via Mongoose. Auth is invite-only email+password with JWT access/refresh tokens (no OTP/SMS). Uploads return `202` immediately and are scored by an in-process background job that calls `ai-backend`'s `/api/bcs/assess`, reconciles its 3-provider response into one score via median+spread, and the frontend polls for the result. Media is stored on local disk for v1.

**Tech Stack:** Node.js 18+, Express 4, Mongoose 8, bcryptjs, jsonwebtoken, multer, axios + form-data (calling ai-backend), nodemailer (invite emails), Jest + Supertest + mongodb-memory-server + nock (testing).

## Global Constraints

- MongoDB via Mongoose is the only persistence layer (per project requirement).
- Auth: invite-only, email + password. No public registration, no SMS/OTP. Only users an admin has invited can log in.
- `ai-backend` (`http://<AI_BACKEND_URL>/api/bcs/assess`) is fixed and MUST NOT be modified. Request: multipart field `images` (send exactly one file). Response: `{claude, gemini, openai}`, each `{final_bcs, confidence, status, error_message, recommendation}`, `confidence` is `"High"|"Medium"|"Low"` (capitalized), `final_bcs` already rounded to 0.25 and clamped to `[1.0, 5.0]`.
- Score reconciliation: median of successful providers' `final_bcs`, rounded to nearest 0.25. Confidence from spread (max − min among successful providers): spread `<= 0.25` → `high`; `<= 0.5` → `medium`; otherwise (or fewer than 2 successful providers) → `low`.
- Flagging: a reading is flagged when reconciled confidence is `low`, OR when it is a sharp drop (`prevScore - newScore >= 0.5`).
- BCS bands: `score < 2.5` → `thin`; `2.5 <= score <= 3.75` → `ideal`; `score > 3.75` → `heavy`.
- v1 accepts images only (`image/jpeg`, `image/png`, `image/webp`), matching `ai-backend`'s `ALLOWED_IMAGE_TYPES`. No video, no ffmpeg.
- No job queue (Bull/Redis) in v1 — fire-and-forget in-process async processing is acceptable.
- Media storage is local disk (`UPLOAD_DIR`) in v1, not S3.
- JWT access token TTL 15m, refresh token TTL 7d. Logout invalidates all outstanding refresh tokens by bumping `user.refreshTokenVersion`.
- Uploading a reading for an unregistered `cowId` auto-creates the cow (`breed: 'Unknown'`, `lactation: 'Unknown'`, `pen: 'Unassigned'`) — assumption, flagged to the user, matches the prototype's `addReadingToCow` fallback.
- All monetary/score arithmetic rounds to the nearest 0.25 via a single `roundQuarter()` helper — never re-implement rounding inline.

---

## File Structure

```
backend/
  package.json
  .env.example
  jest.config.js
  src/
    config/env.js                # validated env vars, single source of truth
    db/connection.js              # mongoose connect/disconnect
    app.js                        # express app factory (no listen, no db connect — testable)
    server.js                     # entry point: connect db, then listen
    models/
      User.js
      Cow.js
      Media.js
      Reading.js
      AuditLog.js
    middleware/
      auth.js                     # requireAuth, requireRole
      errorHandler.js
      asyncHandler.js
    services/
      authService.js              # password hashing, JWT, invite tokens
      emailService.js              # nodemailer wrapper + invite email template
      storageService.js            # local-disk file save/read
      scoringService.js            # pure: reconcileProviders, bandFor, isSharpDrop, roundQuarter
      aiBackendClient.js            # axios wrapper -> POST /api/bcs/assess
      userService.js                # inviteUser, countAdmins
      readingService.js             # findOrCreateCow, createProcessingReading
    jobs/
      processReading.js             # background job tying aiBackendClient + scoringService together
    controllers/
      authController.js
      userController.js
      cowController.js
      readingController.js
      reviewController.js
      auditController.js
    routes/
      authRoutes.js
      userRoutes.js
      cowRoutes.js
      readingRoutes.js
      reviewRoutes.js
      auditRoutes.js
      index.js                     # mounts all of the above under /api
  uploads/                         # gitignored, local media storage
  tests/
    setup.js                       # mongodb-memory-server connect/clear/close helpers
    unit/
      scoringService.test.js
      authService.test.js
      aiBackendClient.test.js
    integration/
      health.test.js
      auth.test.js
      users.test.js
      cows.test.js
      readings.test.js
      review.test.js
      audit.test.js
```

---

### Task 1: Project scaffold + health check

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/jest.config.js`
- Create: `backend/src/config/env.js`
- Create: `backend/src/db/connection.js`
- Create: `backend/src/app.js`
- Create: `backend/src/server.js`
- Create: `backend/src/routes/index.js`
- Create: `backend/src/middleware/errorHandler.js`
- Create: `backend/.gitignore`
- Test: `backend/tests/setup.js`
- Test: `backend/tests/integration/health.test.js`

**Interfaces:**
- Produces: `createApp()` (from `src/app.js`) — returns an Express app with no side effects (no `listen`, no DB connect), used by every integration test in later tasks. `connectDb(uri)` / `disconnectDb()` (from `src/db/connection.js`). `config` object (from `src/config/env.js`) with shape `{port, mongodbUrl, jwtAccessSecret, jwtRefreshSecret, aiBackendUrl, frontendUrl, smtp:{host,port,secure,user,pass,from}, uploadDir}`.

- [ ] **Step 1: Scaffold package.json and install dependencies**

```bash
cd backend
mkdir -p src/config src/db src/models src/middleware src/services src/jobs src/controllers src/routes uploads tests/unit tests/integration
```

Create `backend/package.json`:

```json
{
  "name": "bcs-tracker-backend",
  "version": "1.0.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "form-data": "^4.0.1",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.7.0",
    "multer": "^1.4.5-lts.1",
    "nodemailer": "^6.9.15",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "mongodb-memory-server": "^10.1.2",
    "nock": "^13.5.5",
    "nodemon": "^3.1.7",
    "supertest": "^7.0.0"
  }
}
```

Run:

```bash
npm install
```

- [ ] **Step 2: Create `.env.example` and `.gitignore`**

`backend/.env.example`:

```
PORT=4000
MONGODB_URL=mongodb://127.0.0.1:27017/bcs_tracker
JWT_ACCESS_SECRET=change-me-access
JWT_REFRESH_SECRET=change-me-refresh
AI_BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="BCS Tracker <no-reply@example.com>"
UPLOAD_DIR=./uploads
```

`backend/.gitignore`:

```
node_modules/
.env
uploads/*
!uploads/.gitkeep
```

```bash
touch uploads/.gitkeep
```

- [ ] **Step 3: Write `src/config/env.js`**

```js
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
```

- [ ] **Step 4: Write `src/db/connection.js`**

```js
const mongoose = require('mongoose');

async function connectDb(uri) {
  await mongoose.connect(uri);
  return mongoose.connection;
}

async function disconnectDb() {
  await mongoose.disconnect();
}

module.exports = { connectDb, disconnectDb };
```

- [ ] **Step 5: Write `src/middleware/errorHandler.js`**

```js
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const message = status < 500 ? err.message : 'Internal server error';
  if (status >= 500) console.error(err); // eslint-disable-line no-console
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
```

- [ ] **Step 6: Write `src/routes/index.js` (empty router for now)**

```js
const express = require('express');
const router = express.Router();

module.exports = router;
```

- [ ] **Step 7: Write `src/app.js`**

```js
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', routes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 8: Write `src/server.js`**

```js
const { createApp } = require('./app');
const { connectDb } = require('./db/connection');
const config = require('./config/env');

async function start() {
  await connectDb(config.mongodbUrl);
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`BCS Tracker backend listening on port ${config.port}`); // eslint-disable-line no-console
  });
}

start();
```

- [ ] **Step 9: Write `jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testTimeout: 20000,
};
```

- [ ] **Step 10: Write `tests/setup.js`**

```js
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

async function connect() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
}

async function closeDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
}

module.exports = { connect, clearDatabase, closeDatabase };
```

- [ ] **Step 11: Write the failing test `tests/integration/health.test.js`**

```js
const request = require('supertest');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');

describe('GET /health', () => {
  beforeAll(async () => { await connect(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('returns ok status', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 12: Run the test suite and verify it passes**

Run: `cd backend && npm test`
Expected: `PASS tests/integration/health.test.js`

- [ ] **Step 13: Commit**

```bash
git add backend/package.json backend/.env.example backend/.gitignore backend/jest.config.js \
        backend/src backend/tests backend/uploads/.gitkeep
git commit -m "feat(backend): scaffold express app with health check"
```

---

### Task 2: User model + password hashing

**Files:**
- Create: `backend/src/models/User.js`
- Create: `backend/src/services/authService.js`
- Test: `backend/tests/unit/authService.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `User` mongoose model with fields `email, name, role ('admin'|'staff'), status ('pending'|'active'), passwordHash, inviteTokenHash, inviteTokenExpiresAt, invitedBy, refreshTokenVersion`. `authService.hashPassword(password)`, `authService.comparePassword(password, hash)` — used by every later auth task.

- [ ] **Step 1: Write `src/models/User.js`**

```js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
    passwordHash: { type: String, default: null },
    inviteTokenHash: { type: String, default: null },
    inviteTokenExpiresAt: { type: Date, default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refreshTokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
```

- [ ] **Step 2: Write the failing test `tests/unit/authService.test.js`**

```js
const { hashPassword, comparePassword } = require('../../src/services/authService');

describe('authService password hashing', () => {
  it('hashes a password and verifies it against the hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    await expect(comparePassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/authService.test.js`
Expected: FAIL — `Cannot find module '../../src/services/authService'`

- [ ] **Step 4: Write `src/services/authService.js` (password portion only)**

```js
const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { hashPassword, comparePassword };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/authService.test.js`
Expected: PASS, 2 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/User.js backend/src/services/authService.js backend/tests/unit/authService.test.js
git commit -m "feat(backend): add User model and password hashing"
```

---

### Task 3: JWT + invite tokens

**Files:**
- Modify: `backend/src/services/authService.js`
- Test: `backend/tests/unit/authService.test.js`

**Interfaces:**
- Consumes: `config` from `src/config/env.js` (`jwtAccessSecret`, `jwtRefreshSecret`).
- Produces: `authService.generateAccessToken(user)`, `authService.generateRefreshToken(user)`, `authService.verifyRefreshToken(token)`, `authService.generateInviteToken()` → `{raw, hash}`, `authService.hashToken(raw)`. `user` here means any object with `_id` and `role`/`refreshTokenVersion` — used by Task 6 (invite), Task 7 (accept-invite), Task 8 (login), Task 9 (refresh/logout).

- [ ] **Step 1: Write the failing tests (append to `tests/unit/authService.test.js`)**

```js
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateInviteToken,
  hashToken,
} = require('../../src/services/authService');

describe('authService tokens', () => {
  const fakeUser = { _id: '507f1f77bcf86cd799439011', role: 'staff', refreshTokenVersion: 0 };

  it('generates an access token carrying the user id and role', () => {
    const jwt = require('jsonwebtoken');
    const config = require('../../src/config/env');
    const token = generateAccessToken(fakeUser);
    const payload = jwt.verify(token, config.jwtAccessSecret);
    expect(payload.sub).toBe(fakeUser._id);
    expect(payload.role).toBe('staff');
  });

  it('generates a refresh token embedding refreshTokenVersion, and verifies it', () => {
    const token = generateRefreshToken(fakeUser);
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe(fakeUser._id);
    expect(payload.ver).toBe(0);
  });

  it('generates an invite token whose hash matches hashToken(raw)', () => {
    const { raw, hash } = generateInviteToken();
    expect(hashToken(raw)).toBe(hash);
    expect(raw).not.toBe(hash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/authService.test.js`
Expected: FAIL — `generateAccessToken is not a function`

- [ ] **Step 3: Extend `src/services/authService.js`**

```js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, {
    expiresIn: '15m',
  });
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), ver: user.refreshTokenVersion },
    config.jwtRefreshSecret,
    { expiresIn: '7d' }
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwtRefreshSecret);
}

function generateInviteToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateInviteToken,
  hashToken,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/authService.test.js`
Expected: PASS, 5 tests total

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/authService.js backend/tests/unit/authService.test.js
git commit -m "feat(backend): add JWT access/refresh tokens and invite token generation"
```

---

### Task 4: Auth middleware

**Files:**
- Create: `backend/src/middleware/auth.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `authService.generateAccessToken` (test only), `User` model.
- Produces: `requireAuth()` — Express middleware factory; on success sets `req.user = {id, email, role, name}`. `requireRole(role)` — Express middleware factory checking `req.user.role`. Every later route in Tasks 6–22 wraps its handlers with these.

- [ ] **Step 1: Write the failing test `tests/integration/auth.test.js`**

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const config = require('../../src/config/env');
const { requireAuth, requireRole } = require('../../src/middleware/auth');

describe('auth middleware', () => {
  let app;

  beforeAll(async () => {
    await connect();
    app = createApp();
    app.get('/api/_test/whoami', requireAuth(), (req, res) => res.json({ user: req.user }));
    app.get('/api/_test/admin-only', requireAuth(), requireRole('admin'), (req, res) =>
      res.json({ ok: true })
    );
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/_test/whoami');
    expect(res.status).toBe(401);
  });

  it('accepts a valid access token for an active user', async () => {
    const user = await User.create({
      email: 'staff@example.com',
      name: 'Staff One',
      role: 'staff',
      status: 'active',
      passwordHash: 'x',
    });
    const token = jwt.sign({ sub: user._id.toString(), role: 'staff' }, config.jwtAccessSecret, {
      expiresIn: '15m',
    });
    const res = await request(app)
      .get('/api/_test/whoami')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('staff@example.com');
  });

  it('rejects a token for a pending (not yet active) user', async () => {
    const user = await User.create({
      email: 'pending@example.com',
      name: 'Pending One',
      role: 'staff',
      status: 'pending',
    });
    const token = jwt.sign({ sub: user._id.toString(), role: 'staff' }, config.jwtAccessSecret, {
      expiresIn: '15m',
    });
    const res = await request(app)
      .get('/api/_test/whoami')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('blocks non-admin roles from an admin-only route', async () => {
    const user = await User.create({
      email: 'staff2@example.com', name: 'Staff Two', role: 'staff', status: 'active', passwordHash: 'x',
    });
    const token = jwt.sign({ sub: user._id.toString(), role: 'staff' }, config.jwtAccessSecret, { expiresIn: '15m' });
    const res = await request(app).get('/api/_test/admin-only').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: FAIL — `Cannot find module '../../src/middleware/auth'`

- [ ] **Step 3: Write `src/middleware/auth.js`**

```js
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

function requireAuth() {
  return async function (req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    let payload;
    try {
      payload = jwt.verify(token, config.jwtAccessSecret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    req.user = { id: user._id.toString(), email: user.email, role: user.role, name: user.name };
    next();
  };
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/auth.js backend/tests/integration/auth.test.js
git commit -m "feat(backend): add requireAuth/requireRole middleware"
```

---

### Task 5: Email service (invite emails)

**Files:**
- Create: `backend/src/services/emailService.js`
- Test: `backend/tests/unit/emailService.test.js`

**Interfaces:**
- Consumes: `config.smtp` from `src/config/env.js`.
- Produces: `emailService.sendInviteEmail({to, name, inviteUrl})` — used by Task 6 (`userService.inviteUser`).

**Note:** Real SMTP credentials (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) must be filled into `backend/.env` before invite emails will actually deliver — this task's test mocks `nodemailer` entirely, so it passes without them. Manual QA of a real inbox happens after Task 6, once you've supplied SMTP config.

- [ ] **Step 1: Write the failing test `tests/unit/emailService.test.js`**

```js
jest.mock('nodemailer');
const nodemailer = require('nodemailer');

describe('emailService.sendInviteEmail', () => {
  it('sends an email with the invite link in the body', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const { sendInviteEmail } = require('../../src/services/emailService');
    await sendInviteEmail({
      to: 'newstaff@example.com',
      name: 'New Staff',
      inviteUrl: 'https://app.example.com/accept-invite?token=abc123&email=newstaff%40example.com',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe('newstaff@example.com');
    expect(call.html).toContain('abc123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/emailService.test.js`
Expected: FAIL — `Cannot find module '../../src/services/emailService'`

- [ ] **Step 3: Write `src/services/emailService.js`**

```js
const nodemailer = require('nodemailer');
const config = require('../config/env');

function createTransport() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

async function sendInviteEmail({ to, name, inviteUrl }) {
  const transport = createTransport();
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject: 'You have been invited to BCS Tracker',
    html:
      `<p>Hi ${name || ''},</p>` +
      `<p>You've been invited to join BCS Tracker. Click below to set your password and activate your account:</p>` +
      `<p><a href="${inviteUrl}">${inviteUrl}</a></p>` +
      `<p>This link expires in 7 days.</p>`,
  });
}

module.exports = { sendInviteEmail, createTransport };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/emailService.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/emailService.js backend/tests/unit/emailService.test.js
git commit -m "feat(backend): add invite email service"
```

---

### Task 6: Invite a user

**Files:**
- Create: `backend/src/services/userService.js`
- Create: `backend/src/controllers/userController.js`
- Create: `backend/src/routes/userRoutes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/users.test.js`

**Interfaces:**
- Consumes: `User` model, `authService.generateInviteToken/hashToken`, `emailService.sendInviteEmail`, `requireAuth`/`requireRole` middleware.
- Produces: `userService.inviteUser({email, name, role, invitedBy})` → creates a `pending` `User` and emails them. `userService.countAdmins(excludeUserId?)` — used by Task 11's remove/demote guards. Route `POST /api/users/invite`.

- [ ] **Step 1: Write the failing test `tests/integration/users.test.js`**

```js
jest.mock('../../src/services/emailService', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const config = require('../../src/config/env');
const { sendInviteEmail } = require('../../src/services/emailService');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('POST /api/users/invite', () => {
  let app, admin, adminToken;

  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    admin = await User.create({ email: 'admin@example.com', name: 'Admin', role: 'admin', status: 'active', passwordHash: 'x' });
    adminToken = tokenFor(admin);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('rejects non-admins', async () => {
    const staff = await User.create({ email: 'staff@example.com', name: 'Staff', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${tokenFor(staff)}`)
      .send({ email: 'new@example.com', name: 'New Person', role: 'staff' });
    expect(res.status).toBe(403);
  });

  it('creates a pending user and sends an invite email', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new@example.com', name: 'New Person', role: 'staff' });

    expect(res.status).toBe(201);
    expect(res.body.user.status).toBe('pending');
    expect(res.body.user.email).toBe('new@example.com');
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);

    const stored = await User.findOne({ email: 'new@example.com' });
    expect(stored.inviteTokenHash).toBeTruthy();
    expect(stored.passwordHash).toBeNull();
  });

  it('rejects inviting an email that already exists', async () => {
    await User.create({ email: 'dup@example.com', name: 'Dup', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'dup@example.com', name: 'Dup Two', role: 'staff' });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/users.test.js`
Expected: FAIL — 404 on `/api/users/invite` (route not mounted)

- [ ] **Step 3: Write `src/services/userService.js`**

```js
const User = require('../models/User');
const { generateInviteToken } = require('./authService');
const { sendInviteEmail } = require('./emailService');
const config = require('../config/env');

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function inviteUser({ email, name, role, invitedBy }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const err = new Error('A user with this email already exists.');
    err.status = 409;
    throw err;
  }
  const { raw, hash } = generateInviteToken();
  const user = await User.create({
    email: normalizedEmail,
    name,
    role,
    status: 'pending',
    inviteTokenHash: hash,
    inviteTokenExpiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    invitedBy,
  });
  const inviteUrl = `${config.frontendUrl}/accept-invite?token=${raw}&email=${encodeURIComponent(normalizedEmail)}`;
  await sendInviteEmail({ to: normalizedEmail, name, inviteUrl });
  return user;
}

async function countAdmins(excludeUserId) {
  const query = { role: 'admin' };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  return User.countDocuments(query);
}

module.exports = { inviteUser, countAdmins, INVITE_TOKEN_TTL_MS };
```

- [ ] **Step 4: Write `src/controllers/userController.js`**

```js
const { inviteUser } = require('../services/userService');

function serializeUser(user) {
  return { id: user._id.toString(), email: user.email, name: user.name, role: user.role, status: user.status };
}

async function invite(req, res, next) {
  try {
    const { email, name, role } = req.body;
    if (!email || !name || !['admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'email, name and a valid role are required.' });
    }
    const user = await inviteUser({ email, name, role, invitedBy: req.user.id });
    res.status(201).json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { invite, serializeUser };
```

- [ ] **Step 5: Write `src/routes/userRoutes.js`**

```js
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.post('/invite', requireAuth(), requireRole('admin'), userController.invite);

module.exports = router;
```

- [ ] **Step 6: Mount it in `src/routes/index.js`**

```js
const express = require('express');
const userRoutes = require('./userRoutes');

const router = express.Router();

router.use('/users', userRoutes);

module.exports = router;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/users.test.js`
Expected: PASS, 3 tests

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/userService.js backend/src/controllers/userController.js \
        backend/src/routes/userRoutes.js backend/src/routes/index.js backend/tests/integration/users.test.js
git commit -m "feat(backend): add admin-only invite endpoint"
```

---

### Task 7: Accept invite

**Files:**
- Create: `backend/src/controllers/authController.js`
- Create: `backend/src/routes/authRoutes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `User` model, `authService.hashToken/hashPassword/generateAccessToken/generateRefreshToken`.
- Produces: `POST /api/auth/accept-invite` → `{accessToken, refreshToken, user}`. Route path `/api/auth` mounted for Tasks 8–10 to extend.

- [ ] **Step 1: Append the failing test to `tests/integration/auth.test.js`**

```js
describe('POST /api/auth/accept-invite', () => {
  let app;
  const crypto = require('crypto');
  const User = require('../../src/models/User');

  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('activates a pending user with a valid token and sets their password', async () => {
    const raw = 'a'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await User.create({
      email: 'pending@example.com', name: 'Pending', role: 'staff', status: 'pending',
      inviteTokenHash: hash, inviteTokenExpiresAt: new Date(Date.now() + 60000),
    });

    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'pending@example.com', token: raw, password: 'new-password-123',
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.status).toBe('active');

    const updated = await User.findOne({ email: 'pending@example.com' });
    expect(updated.status).toBe('active');
    expect(updated.passwordHash).toBeTruthy();
    expect(updated.inviteTokenHash).toBeNull();
  });

  it('rejects an expired invite token', async () => {
    const raw = 'b'.repeat(64);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await User.create({
      email: 'expired@example.com', name: 'Expired', role: 'staff', status: 'pending',
      inviteTokenHash: hash, inviteTokenExpiresAt: new Date(Date.now() - 1000),
    });
    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'expired@example.com', token: raw, password: 'new-password-123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a wrong token', async () => {
    const hash = crypto.createHash('sha256').update('c'.repeat(64)).digest('hex');
    await User.create({
      email: 'wrong@example.com', name: 'Wrong', role: 'staff', status: 'pending',
      inviteTokenHash: hash, inviteTokenExpiresAt: new Date(Date.now() + 60000),
    });
    const res = await request(app).post('/api/auth/accept-invite').send({
      email: 'wrong@example.com', token: 'd'.repeat(64), password: 'new-password-123',
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: FAIL — 404 on `/api/auth/accept-invite`

- [ ] **Step 3: Write `src/controllers/authController.js` (accept-invite portion)**

```js
const User = require('../models/User');
const {
  hashToken, hashPassword, generateAccessToken, generateRefreshToken,
} = require('../services/authService');

function serializeUser(user) {
  return { id: user._id.toString(), email: user.email, name: user.name, role: user.role, status: user.status };
}

async function acceptInvite(req, res, next) {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ error: 'email, token and password are required.' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || user.status !== 'pending' || !user.inviteTokenHash) {
      return res.status(400).json({ error: 'Invalid or already-used invite.' });
    }
    if (user.inviteTokenExpiresAt < new Date()) {
      return res.status(400).json({ error: 'This invite link has expired.' });
    }
    if (hashToken(token) !== user.inviteTokenHash) {
      return res.status(400).json({ error: 'Invalid invite token.' });
    }

    user.passwordHash = await hashPassword(password);
    user.status = 'active';
    user.inviteTokenHash = null;
    user.inviteTokenExpiresAt = null;
    await user.save();

    res.json({
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { acceptInvite, serializeUser };
```

- [ ] **Step 4: Write `src/routes/authRoutes.js`**

```js
const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/accept-invite', authController.acceptInvite);

module.exports = router;
```

- [ ] **Step 5: Mount it in `src/routes/index.js`**

```js
const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);

module.exports = router;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: PASS, 7 tests total

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/authRoutes.js \
        backend/src/routes/index.js backend/tests/integration/auth.test.js
git commit -m "feat(backend): add accept-invite endpoint"
```

---

### Task 8: Login

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/routes/authRoutes.js`
- Test: `backend/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `authService.comparePassword/generateAccessToken/generateRefreshToken`.
- Produces: `POST /api/auth/login` → `{accessToken, refreshToken, user}`.

- [ ] **Step 1: Append the failing test to `tests/integration/auth.test.js`**

```js
describe('POST /api/auth/login', () => {
  let app;
  const { hashPassword } = require('../../src/services/authService');
  const User = require('../../src/models/User');

  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('logs in an active user with the correct password', async () => {
    await User.create({
      email: 'active@example.com', name: 'Active', role: 'staff', status: 'active',
      passwordHash: await hashPassword('correct-password'),
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'active@example.com', password: 'correct-password',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('active@example.com');
  });

  it('rejects the wrong password', async () => {
    await User.create({
      email: 'active2@example.com', name: 'Active Two', role: 'staff', status: 'active',
      passwordHash: await hashPassword('correct-password'),
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'active2@example.com', password: 'wrong-password',
    });
    expect(res.status).toBe(401);
  });

  it('rejects login for a pending (not yet activated) user', async () => {
    await User.create({ email: 'pend@example.com', name: 'Pend', role: 'staff', status: 'pending' });
    const res = await request(app).post('/api/auth/login').send({
      email: 'pend@example.com', password: 'anything',
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: FAIL — 404 on `/api/auth/login`

- [ ] **Step 3: Extend `src/controllers/authController.js`**

Add to the existing file (keep `acceptInvite` and `serializeUser` above):

```js
const { comparePassword } = require('../services/authService');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || user.status !== 'active' || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.json({
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { acceptInvite, login, serializeUser };
```

(Remember to add `comparePassword` to the destructured import at the top alongside `hashToken, hashPassword, generateAccessToken, generateRefreshToken`.)

- [ ] **Step 4: Add the route in `src/routes/authRoutes.js`**

```js
router.post('/login', authController.login);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: PASS, 10 tests total

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/authRoutes.js backend/tests/integration/auth.test.js
git commit -m "feat(backend): add login endpoint"
```

---

### Task 9: Refresh + logout

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/routes/authRoutes.js`
- Test: `backend/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `authService.verifyRefreshToken`, `requireAuth`.
- Produces: `POST /api/auth/refresh` → `{accessToken}`. `POST /api/auth/logout` (authed) → `{ok: true}`, bumps `refreshTokenVersion`.

- [ ] **Step 1: Append the failing test to `tests/integration/auth.test.js`**

```js
describe('POST /api/auth/refresh and /logout', () => {
  let app;
  const { hashPassword } = require('../../src/services/authService');
  const User = require('../../src/models/User');

  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  async function loginAndGetTokens() {
    await User.create({
      email: 'refresh@example.com', name: 'Refresh', role: 'staff', status: 'active',
      passwordHash: await hashPassword('correct-password'),
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'refresh@example.com', password: 'correct-password',
    });
    return res.body;
  }

  it('issues a new access token from a valid refresh token', async () => {
    const { refreshToken } = await loginAndGetTokens();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('invalidates the refresh token after logout', async () => {
    const { accessToken, refreshToken } = await loginAndGetTokens();
    const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: FAIL — 404 on `/api/auth/refresh`

- [ ] **Step 3: Extend `src/controllers/authController.js`**

```js
const { verifyRefreshToken } = require('../services/authService');
// (add to the destructured import at top)

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required.' });
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active' || user.refreshTokenVersion !== payload.ver) {
      return res.status(401).json({ error: 'Refresh token has been revoked.' });
    }
    res.json({ accessToken: generateAccessToken(user) });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { refreshTokenVersion: 1 } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { acceptInvite, login, refresh, logout, serializeUser };
```

- [ ] **Step 4: Extend `src/routes/authRoutes.js`**

```js
const { requireAuth } = require('../middleware/auth');

router.post('/refresh', authController.refresh);
router.post('/logout', requireAuth(), authController.logout);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: PASS, 12 tests total

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/authRoutes.js backend/tests/integration/auth.test.js
git commit -m "feat(backend): add refresh token rotation and logout"
```

---

### Task 10: GET /api/auth/me

**Files:**
- Modify: `backend/src/controllers/authController.js`
- Modify: `backend/src/routes/authRoutes.js`
- Test: `backend/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `requireAuth`.
- Produces: `GET /api/auth/me` → `{id, email, name, role, status}` — the frontend's auth-bootstrap call.

- [ ] **Step 1: Append the failing test to `tests/integration/auth.test.js`**

```js
describe('GET /api/auth/me', () => {
  let app;
  const { hashPassword } = require('../../src/services/authService');
  const User = require('../../src/models/User');

  beforeAll(async () => { app = createApp(); });
  afterEach(async () => { await clearDatabase(); });

  it('returns the current user for a valid access token', async () => {
    await User.create({
      email: 'me@example.com', name: 'Me', role: 'admin', status: 'active',
      passwordHash: await hashPassword('correct-password'),
    });
    const login = await request(app).post('/api/auth/login').send({ email: 'me@example.com', password: 'correct-password' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@example.com');
    expect(res.body.role).toBe('admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: FAIL — 404 on `/api/auth/me`

- [ ] **Step 3: Extend `src/controllers/authController.js`**

```js
async function me(req, res) {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role });
}

module.exports = { acceptInvite, login, refresh, logout, me, serializeUser };
```

- [ ] **Step 4: Extend `src/routes/authRoutes.js`**

```js
router.get('/me', requireAuth(), authController.me);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/auth.test.js`
Expected: PASS, 13 tests total

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/authController.js backend/src/routes/authRoutes.js backend/tests/integration/auth.test.js
git commit -m "feat(backend): add GET /api/auth/me"
```

---

### Task 11: User list, role change, remove (with last-admin guard)

**Files:**
- Modify: `backend/src/services/userService.js`
- Modify: `backend/src/controllers/userController.js`
- Modify: `backend/src/routes/userRoutes.js`
- Test: `backend/tests/integration/users.test.js`

**Interfaces:**
- Consumes: `userService.countAdmins`.
- Produces: `GET /api/users`, `PATCH /api/users/:id/role`, `DELETE /api/users/:id` — all admin-only.

- [ ] **Step 1: Append the failing tests to `tests/integration/users.test.js`**

```js
describe('GET/PATCH/DELETE /api/users', () => {
  let app, admin, adminToken;
  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    admin = await User.create({ email: 'admin2@example.com', name: 'Admin2', role: 'admin', status: 'active', passwordHash: 'x' });
    adminToken = tokenFor(admin);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  it('lists users', async () => {
    await User.create({ email: 'a@example.com', name: 'A', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(2);
  });

  it('changes a user role', async () => {
    const staff = await User.create({ email: 'b@example.com', name: 'B', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app)
      .patch(`/api/users/${staff._id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('refuses to demote the last remaining admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${admin._id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' });
    expect(res.status).toBe(400);
  });

  it('removes a user', async () => {
    const staff = await User.create({ email: 'c@example.com', name: 'C', role: 'staff', status: 'active', passwordHash: 'x' });
    const res = await request(app).delete(`/api/users/${staff._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(await User.findById(staff._id)).toBeNull();
  });

  it('refuses to remove the last remaining admin', async () => {
    const res = await request(app).delete(`/api/users/${admin._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/users.test.js`
Expected: FAIL — 404s on the new routes

- [ ] **Step 3: Extend `src/services/userService.js`**

Add below `countAdmins`:

```js
async function listUsers({ status, role } = {}) {
  const query = {};
  if (status) query.status = status;
  if (role) query.role = role;
  return User.find(query).sort({ createdAt: 1 });
}

async function changeRole(userId, newRole) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  if (user.role === 'admin' && newRole !== 'admin') {
    const remaining = await countAdmins(userId);
    if (remaining === 0) {
      const err = new Error('Cannot demote the last remaining admin.');
      err.status = 400;
      throw err;
    }
  }
  user.role = newRole;
  await user.save();
  return user;
}

async function removeUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }
  if (user.role === 'admin') {
    const remaining = await countAdmins(userId);
    if (remaining === 0) {
      const err = new Error('Cannot remove the last remaining admin.');
      err.status = 400;
      throw err;
    }
  }
  await User.deleteOne({ _id: userId });
}

module.exports = { inviteUser, countAdmins, listUsers, changeRole, removeUser, INVITE_TOKEN_TTL_MS };
```

- [ ] **Step 4: Extend `src/controllers/userController.js`**

```js
const { inviteUser, listUsers, changeRole, removeUser } = require('../services/userService');

async function list(req, res, next) {
  try {
    const { status, role } = req.query;
    const users = await listUsers({ status, role });
    res.json({ users: users.map(serializeUser) });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    if (!['admin', 'staff'].includes(req.body.role)) {
      return res.status(400).json({ error: 'role must be admin or staff.' });
    }
    const user = await changeRole(req.params.id, req.body.role);
    res.json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await removeUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { invite, list, updateRole, remove, serializeUser };
```

- [ ] **Step 5: Extend `src/routes/userRoutes.js`**

```js
router.get('/', requireAuth(), requireRole('admin'), userController.list);
router.patch('/:id/role', requireAuth(), requireRole('admin'), userController.updateRole);
router.delete('/:id', requireAuth(), requireRole('admin'), userController.remove);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/users.test.js`
Expected: PASS, 8 tests total

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/userService.js backend/src/controllers/userController.js \
        backend/src/routes/userRoutes.js backend/tests/integration/users.test.js
git commit -m "feat(backend): add user list/role-change/remove with last-admin guard"
```

---

### Task 12: Cow model + CRUD

**Files:**
- Create: `backend/src/models/Cow.js`
- Create: `backend/src/controllers/cowController.js`
- Create: `backend/src/routes/cowRoutes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/cows.test.js`

**Interfaces:**
- Produces: `Cow` model with fields `cowId (unique), breed, lactation, pen, latestScore, latestBand ('thin'|'ideal'|'heavy'), latestConfidence ('high'|'medium'|'low'), lastScoredAt, flagged, sharpDrop, dropAmount`. Routes `POST /api/cows`, `GET /api/cows/:cowId`, `PATCH /api/cows/:cowId` — used by Task 16's auto-create and Task 17's denormalization update.

- [ ] **Step 1: Write `src/models/Cow.js`**

```js
const mongoose = require('mongoose');

const cowSchema = new mongoose.Schema(
  {
    cowId: { type: String, required: true, unique: true, trim: true },
    breed: { type: String, default: 'Unknown' },
    lactation: { type: String, default: 'Unknown' },
    pen: { type: String, default: 'Unassigned' },
    latestScore: { type: Number, default: null },
    latestBand: { type: String, enum: ['thin', 'ideal', 'heavy', null], default: null },
    latestConfidence: { type: String, enum: ['high', 'medium', 'low', null], default: null },
    lastScoredAt: { type: Date, default: null },
    flagged: { type: Boolean, default: false },
    sharpDrop: { type: Boolean, default: false },
    dropAmount: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cow', cowSchema);
```

- [ ] **Step 2: Write the failing test `tests/integration/cows.test.js`**

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('Cow CRUD', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'staff@example.com', name: 'Staff', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('creates a cow', async () => {
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({
      cowId: '4417', breed: 'Holstein', lactation: 'Mid', pen: 'Pen 1',
    });
    expect(res.status).toBe(201);
    expect(res.body.cow.cowId).toBe('4417');
  });

  it('rejects a duplicate cowId', async () => {
    await Cow.create({ cowId: '4417' });
    const res = await request(app).post('/api/cows').set('Authorization', `Bearer ${token}`).send({ cowId: '4417' });
    expect(res.status).toBe(409);
  });

  it('gets a cow by cowId', async () => {
    await Cow.create({ cowId: '4417', breed: 'Jersey' });
    const res = await request(app).get('/api/cows/4417').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cow.breed).toBe('Jersey');
  });

  it('returns 404 for an unknown cowId', async () => {
    const res = await request(app).get('/api/cows/9999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('updates a cow', async () => {
    await Cow.create({ cowId: '4417', pen: 'Pen 1' });
    const res = await request(app).patch('/api/cows/4417').set('Authorization', `Bearer ${token}`).send({ pen: 'Pen 2' });
    expect(res.status).toBe(200);
    expect(res.body.cow.pen).toBe('Pen 2');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/cows.test.js`
Expected: FAIL — 404s (routes not mounted)

- [ ] **Step 4: Write `src/controllers/cowController.js`**

```js
const Cow = require('../models/Cow');

function serializeCow(cow) {
  return {
    cowId: cow.cowId, breed: cow.breed, lactation: cow.lactation, pen: cow.pen,
    latestScore: cow.latestScore, latestBand: cow.latestBand, latestConfidence: cow.latestConfidence,
    lastScoredAt: cow.lastScoredAt, flagged: cow.flagged, sharpDrop: cow.sharpDrop, dropAmount: cow.dropAmount,
  };
}

async function create(req, res, next) {
  try {
    const { cowId, breed, lactation, pen } = req.body;
    if (!cowId) return res.status(400).json({ error: 'cowId is required.' });
    const existing = await Cow.findOne({ cowId });
    if (existing) return res.status(409).json({ error: 'A cow with this ID already exists.' });
    const cow = await Cow.create({ cowId, breed, lactation, pen });
    res.status(201).json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const cow = await Cow.findOne({ cowId: req.params.cowId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    res.json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { breed, lactation, pen } = req.body;
    const update = {};
    if (breed !== undefined) update.breed = breed;
    if (lactation !== undefined) update.lactation = lactation;
    if (pen !== undefined) update.pen = pen;
    const cow = await Cow.findOneAndUpdate({ cowId: req.params.cowId }, update, { new: true });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    res.json({ cow: serializeCow(cow) });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, update, serializeCow };
```

- [ ] **Step 5: Write `src/routes/cowRoutes.js`**

```js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const cowController = require('../controllers/cowController');

const router = express.Router();

router.post('/', requireAuth(), cowController.create);
router.get('/:cowId', requireAuth(), cowController.getOne);
router.patch('/:cowId', requireAuth(), cowController.update);

module.exports = router;
```

- [ ] **Step 6: Mount it in `src/routes/index.js`**

```js
const cowRoutes = require('./cowRoutes');
router.use('/cows', cowRoutes);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/cows.test.js`
Expected: PASS, 5 tests

- [ ] **Step 8: Commit**

```bash
git add backend/src/models/Cow.js backend/src/controllers/cowController.js backend/src/routes/cowRoutes.js \
        backend/src/routes/index.js backend/tests/integration/cows.test.js
git commit -m "feat(backend): add Cow model and CRUD endpoints"
```

---

### Task 13: Media model + local-disk storage service

**Files:**
- Create: `backend/src/models/Media.js`
- Create: `backend/src/services/storageService.js`
- Test: `backend/tests/unit/storageService.test.js`

**Interfaces:**
- Consumes: `config.uploadDir`.
- Produces: `Media` model `{storageKey, mimeType, size, originalName}`. `storageService.saveFile(buffer, originalName)` → `{storageKey, size}`. `storageService.readFile(storageKey)` → `Buffer`. `storageService.absolutePath(storageKey)` → string path — used by Task 16 (upload) and Task 18 (media serving).

- [ ] **Step 1: Write `src/models/Media.js`**

```js
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', mediaSchema);
```

- [ ] **Step 2: Write the failing test `tests/unit/storageService.test.js`**

```js
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('storageService', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcs-test-'));
    jest.resetModules();
    process.env.UPLOAD_DIR = tmpDir;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves a buffer to disk and returns a storageKey + size', async () => {
    const { saveFile, readFile, absolutePath } = require('../../src/services/storageService');
    const buffer = Buffer.from('fake-image-bytes');
    const { storageKey, size } = await saveFile(buffer, 'photo.jpg');

    expect(size).toBe(buffer.length);
    expect(fs.existsSync(absolutePath(storageKey))).toBe(true);

    const readBack = await readFile(storageKey);
    expect(readBack.equals(buffer)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/storageService.test.js`
Expected: FAIL — `Cannot find module '../../src/services/storageService'`

- [ ] **Step 4: Write `src/services/storageService.js`**

```js
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

function absolutePath(storageKey) {
  return path.join(path.resolve(config.uploadDir), storageKey);
}

async function saveFile(buffer, originalName) {
  const dir = path.resolve(config.uploadDir);
  await fsp.mkdir(dir, { recursive: true });
  const ext = path.extname(originalName || '') || '';
  const storageKey = `${uuidv4()}${ext}`;
  await fsp.writeFile(path.join(dir, storageKey), buffer);
  return { storageKey, size: buffer.length };
}

async function readFile(storageKey) {
  return fsp.readFile(absolutePath(storageKey));
}

module.exports = { saveFile, readFile, absolutePath };
```

**Note:** `config` is loaded once at module import time reading `process.env.UPLOAD_DIR` — the test uses `jest.resetModules()` before each run specifically so re-requiring `../../src/config/env` and `../../src/services/storageService` picks up the freshly-set env var.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/storageService.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/Media.js backend/src/services/storageService.js backend/tests/unit/storageService.test.js
git commit -m "feat(backend): add Media model and local-disk storage service"
```

---

### Task 14: Reading model + scoringService (pure logic)

**Files:**
- Create: `backend/src/models/Reading.js`
- Create: `backend/src/services/scoringService.js`
- Test: `backend/tests/unit/scoringService.test.js`

**Interfaces:**
- Produces: `Reading` model — see full field list in File Structure section. `scoringService.roundQuarter(n)`, `scoringService.bandFor(score)` → `'thin'|'ideal'|'heavy'`, `scoringService.isSharpDrop(prevScore, newScore)` → boolean, `scoringService.reconcileProviders(aiResponse)` → `{status, score, confidence, spread, flagged, flagReason, providerResults}` — the core of Task 17's job.

- [ ] **Step 1: Write `src/models/Reading.js`**

```js
const mongoose = require('mongoose');

const providerResultSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    finalBcs: { type: Number, default: null },
    confidence: { type: String, default: null },
    status: { type: String, required: true },
    errorMessage: { type: String, default: null },
  },
  { _id: false }
);

const readingSchema = new mongoose.Schema(
  {
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true, index: true },
    media: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
    status: { type: String, enum: ['processing', 'scored', 'failed'], default: 'processing' },
    score: { type: Number, default: null },
    confidence: { type: String, enum: ['high', 'medium', 'low', null], default: null },
    band: { type: String, enum: ['thin', 'ideal', 'heavy', null], default: null },
    flagged: { type: Boolean, default: false },
    flagReason: { type: String, default: null },
    reviewStatus: { type: String, enum: ['not_required', 'pending', 'approved', 'overridden'], default: 'not_required' },
    spread: { type: Number, default: null },
    providerResults: { type: [providerResultSchema], default: [] },
    errorMessage: { type: String, default: null },
    capturedAt: { type: Date, required: true, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reading', readingSchema);
```

- [ ] **Step 2: Write the failing test `tests/unit/scoringService.test.js`**

```js
const { roundQuarter, bandFor, isSharpDrop, reconcileProviders } = require('../../src/services/scoringService');

describe('roundQuarter', () => {
  it('rounds to the nearest 0.25', () => {
    expect(roundQuarter(3.1)).toBe(3.0);
    expect(roundQuarter(3.13)).toBe(3.25);
    expect(roundQuarter(3.4)).toBe(3.5);
  });
});

describe('bandFor', () => {
  it('classifies scores into thin/ideal/heavy', () => {
    expect(bandFor(2.25)).toBe('thin');
    expect(bandFor(2.5)).toBe('ideal');
    expect(bandFor(3.75)).toBe('ideal');
    expect(bandFor(4.0)).toBe('heavy');
  });
});

describe('isSharpDrop', () => {
  it('flags a drop of 0.5 or more', () => {
    expect(isSharpDrop(3.5, 3.0)).toBe(true);
    expect(isSharpDrop(3.5, 3.25)).toBe(false);
  });
  it('returns false when there is no previous score', () => {
    expect(isSharpDrop(null, 3.0)).toBe(false);
  });
});

describe('reconcileProviders', () => {
  it('takes the median of successful providers and reports high confidence on tight agreement', () => {
    const result = reconcileProviders({
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 3.5, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
    });
    expect(result.status).toBe('scored');
    expect(result.score).toBe(3.25);
    expect(result.confidence).toBe('high');
    expect(result.flagged).toBe(false);
    expect(result.providerResults).toHaveLength(3);
  });

  it('reports low confidence and flags when providers disagree widely', () => {
    const result = reconcileProviders({
      claude: { final_bcs: 2.5, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 4.0, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 3.25, confidence: 'Medium', status: 'success', error_message: null },
    });
    expect(result.confidence).toBe('low');
    expect(result.flagged).toBe(true);
  });

  it('flags low confidence when fewer than 2 providers succeed', () => {
    const result = reconcileProviders({
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      gemini: { status: 'error', error_message: 'timeout' },
      openai: { status: 'error', error_message: 'rate limited' },
    });
    expect(result.status).toBe('scored');
    expect(result.confidence).toBe('low');
    expect(result.flagged).toBe(true);
    expect(result.score).toBe(3.25);
  });

  it('returns status failed when every provider fails', () => {
    const result = reconcileProviders({
      claude: { status: 'error', error_message: 'a' },
      gemini: { status: 'error', error_message: 'b' },
      openai: { status: 'error', error_message: 'c' },
    });
    expect(result.status).toBe('failed');
    expect(result.score).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/scoringService.test.js`
Expected: FAIL — `Cannot find module '../../src/services/scoringService'`

- [ ] **Step 4: Write `src/services/scoringService.js`**

```js
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

function bandFor(score) {
  if (score < 2.5) return 'thin';
  if (score <= 3.75) return 'ideal';
  return 'heavy';
}

function isSharpDrop(prevScore, newScore) {
  if (prevScore == null) return false;
  return prevScore - newScore >= 0.5;
}

const PROVIDER_NAMES = ['claude', 'gemini', 'openai'];

function reconcileProviders(aiResponse) {
  const providerResults = PROVIDER_NAMES.map((provider) => {
    const raw = aiResponse[provider] || {};
    return {
      provider,
      finalBcs: raw.final_bcs ?? null,
      confidence: raw.confidence ? raw.confidence.toLowerCase() : null,
      status: raw.status || 'error',
      errorMessage: raw.error_message ?? null,
    };
  });

  const successful = providerResults.filter((p) => p.status === 'success' && typeof p.finalBcs === 'number');

  if (successful.length === 0) {
    return { status: 'failed', providerResults, errorMessage: 'All providers failed to produce a score.' };
  }

  const scores = successful.map((p) => p.finalBcs).sort((a, b) => a - b);
  const mid = Math.floor(scores.length / 2);
  const medianRaw = scores.length % 2 === 0 ? (scores[mid - 1] + scores[mid]) / 2 : scores[mid];
  const score = roundQuarter(medianRaw);
  const spread = scores[scores.length - 1] - scores[0];

  let confidence;
  if (successful.length < 2) confidence = 'low';
  else if (spread <= 0.25) confidence = 'high';
  else if (spread <= 0.5) confidence = 'medium';
  else confidence = 'low';

  const flagged = confidence === 'low';
  const flagReason = flagged
    ? successful.length < 2
      ? 'Only one model produced a score.'
      : `Models disagreed by ${spread.toFixed(2)} pts.`
    : null;

  return { status: 'scored', score, confidence, spread, flagged, flagReason, providerResults };
}

module.exports = { roundQuarter, bandFor, isSharpDrop, reconcileProviders };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/scoringService.test.js`
Expected: PASS, 4 describe blocks, 8 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/Reading.js backend/src/services/scoringService.js backend/tests/unit/scoringService.test.js
git commit -m "feat(backend): add Reading model and score reconciliation logic"
```

---

### Task 15: ai-backend HTTP client

**Files:**
- Create: `backend/src/services/aiBackendClient.js`
- Test: `backend/tests/unit/aiBackendClient.test.js`

**Interfaces:**
- Consumes: `config.aiBackendUrl`.
- Produces: `aiBackendClient.assessImage({buffer, mimeType, filename})` → resolves to the raw `{claude, gemini, openai}` object (or throws with a normalized `.message` on network/5xx failure) — the single integration point Task 17's job calls into.

- [ ] **Step 1: Write the failing test `tests/unit/aiBackendClient.test.js`**

```js
const nock = require('nock');
const config = require('../../src/config/env');

describe('aiBackendClient.assessImage', () => {
  afterEach(() => nock.cleanAll());

  it('posts the image to /api/bcs/assess and returns the parsed response', async () => {
    const mockResponse = {
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
      gemini: { final_bcs: 3.5, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
      openai: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null, recommendation: 'ok' },
    };
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, mockResponse);

    const { assessImage } = require('../../src/services/aiBackendClient');
    const result = await assessImage({ buffer: Buffer.from('fake'), mimeType: 'image/jpeg', filename: 'cow.jpg' });

    expect(result).toEqual(mockResponse);
  });

  it('throws a normalized error when ai-backend returns a 500', async () => {
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(500, { detail: 'All providers failed' });

    const { assessImage } = require('../../src/services/aiBackendClient');
    await expect(
      assessImage({ buffer: Buffer.from('fake'), mimeType: 'image/jpeg', filename: 'cow.jpg' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/unit/aiBackendClient.test.js`
Expected: FAIL — `Cannot find module '../../src/services/aiBackendClient'`

- [ ] **Step 3: Write `src/services/aiBackendClient.js`**

```js
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config/env');

async function assessImage({ buffer, mimeType, filename }) {
  const form = new FormData();
  form.append('images', buffer, { filename, contentType: mimeType });

  try {
    const response = await axios.post(`${config.aiBackendUrl}/api/bcs/assess`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
    });
    return response.data;
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;
    throw new Error(`ai-backend request failed: ${detail}`);
  }
}

module.exports = { assessImage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/unit/aiBackendClient.test.js`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/aiBackendClient.js backend/tests/unit/aiBackendClient.test.js
git commit -m "feat(backend): add ai-backend HTTP client"
```

---

### Task 16: POST /api/readings (upload endpoint)

**Files:**
- Create: `backend/src/services/readingService.js`
- Create: `backend/src/controllers/readingController.js`
- Create: `backend/src/routes/readingRoutes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/readings.test.js`

**Interfaces:**
- Consumes: `Cow`, `Media`, `Reading` models, `storageService.saveFile`.
- Produces: `readingService.findOrCreateCow(cowId)`, `readingService.createProcessingReading({cowId, buffer, mimeType, originalName, createdBy})` → `Reading` doc with `status: 'processing'`. Route `POST /api/readings` → `202 {readingId, status: 'processing'}`. The background job it kicks off (`processReading`) is stubbed out via `jest.mock` in this task's test and implemented for real in Task 17.

- [ ] **Step 1: Write the failing test `tests/integration/readings.test.js`**

```js
jest.mock('../../src/jobs/processReading', () => ({
  processReading: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Reading = require('../../src/models/Reading');
const config = require('../../src/config/env');
const { processReading } = require('../../src/jobs/processReading');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('POST /api/readings', () => {
  let app, token;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'up@example.com', name: 'Up', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });
  afterAll(async () => { await closeDatabase(); });

  it('creates a processing reading, auto-creating an unknown cow, and returns 202', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417')
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'cow.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('processing');
    expect(res.body.readingId).toBeTruthy();

    const cow = await Cow.findOne({ cowId: '4417' });
    expect(cow).toBeTruthy();
    expect(cow.breed).toBe('Unknown');

    const reading = await Reading.findById(res.body.readingId);
    expect(reading.status).toBe('processing');
    expect(processReading).toHaveBeenCalledWith(res.body.readingId);
  });

  it('rejects a request with no cowId', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'cow.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  it('rejects a video file', async () => {
    const res = await request(app)
      .post('/api/readings')
      .set('Authorization', `Bearer ${token}`)
      .field('cowId', '4417')
      .attach('file', Buffer.from('fake-video-bytes'), { filename: 'cow.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/readings.test.js`
Expected: FAIL — 404 on `/api/readings`

- [ ] **Step 3: Write `src/services/readingService.js`**

```js
const Cow = require('../models/Cow');
const Media = require('../models/Media');
const Reading = require('../models/Reading');
const { saveFile } = require('./storageService');

async function findOrCreateCow(cowId) {
  let cow = await Cow.findOne({ cowId });
  if (!cow) {
    cow = await Cow.create({ cowId, breed: 'Unknown', lactation: 'Unknown', pen: 'Unassigned' });
  }
  return cow;
}

async function createProcessingReading({ cowId, buffer, mimeType, originalName, createdBy }) {
  const cow = await findOrCreateCow(cowId);
  const { storageKey, size } = await saveFile(buffer, originalName);
  const media = await Media.create({ storageKey, mimeType, size, originalName });
  const reading = await Reading.create({
    cow: cow._id,
    media: media._id,
    status: 'processing',
    capturedAt: new Date(),
    createdBy,
  });
  return reading;
}

module.exports = { findOrCreateCow, createProcessingReading };
```

- [ ] **Step 4: Write `src/controllers/readingController.js`**

```js
const multer = require('multer');
const { createProcessingReading } = require('../services/readingService');
const { processReading } = require('../jobs/processReading');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(Object.assign(new Error(`Unsupported file type '${file.mimetype}'. Allowed: ${ALLOWED_TYPES.join(', ')}`), { status: 400 }));
    }
    cb(null, true);
  },
});

async function create(req, res, next) {
  try {
    const { cowId } = req.body;
    if (!cowId || !cowId.trim()) {
      return res.status(400).json({ error: 'cowId is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A file is required.' });
    }
    const reading = await createProcessingReading({
      cowId: cowId.trim(),
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      createdBy: req.user.id,
    });
    processReading(reading._id.toString());
    res.status(202).json({ readingId: reading._id.toString(), status: reading.status });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, uploadMiddleware: upload.single('file') };
```

- [ ] **Step 5: Create the placeholder job module `src/jobs/processReading.js`** (stubbed for now; implemented fully in Task 17)

```js
async function processReading(readingId) {
  console.warn(`processReading(${readingId}) not yet implemented`); // eslint-disable-line no-console
}

module.exports = { processReading };
```

- [ ] **Step 6: Write `src/routes/readingRoutes.js`**

```js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const readingController = require('../controllers/readingController');
const { errorHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post(
  '/',
  requireAuth(),
  (req, res, next) => {
    readingController.uploadMiddleware(req, res, (err) => {
      if (err) return errorHandler(err, req, res, next);
      next();
    });
  },
  readingController.create
);

module.exports = router;
```

- [ ] **Step 7: Mount it in `src/routes/index.js`**

```js
const readingRoutes = require('./readingRoutes');
router.use('/readings', readingRoutes);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/readings.test.js`
Expected: PASS, 3 tests

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/readingService.js backend/src/controllers/readingController.js \
        backend/src/routes/readingRoutes.js backend/src/routes/index.js backend/src/jobs/processReading.js \
        backend/tests/integration/readings.test.js
git commit -m "feat(backend): add async upload endpoint for readings"
```

---

### Task 17: processReading background job

**Files:**
- Modify: `backend/src/jobs/processReading.js`
- Test: `backend/tests/integration/readings.test.js`

**Interfaces:**
- Consumes: `aiBackendClient.assessImage`, `scoringService.reconcileProviders/bandFor/isSharpDrop`, `storageService.readFile`, `Reading`/`Cow`/`Media` models.
- Produces: `processReading(readingId)` — the real implementation. Updates the `Reading` doc to `status: 'scored'|'failed'` and denormalizes onto `Cow`. This is what Task 18's poll endpoint reads.

- [ ] **Step 1: Write the failing test — new file `backend/tests/integration/processReading.test.js`**

```js
const nock = require('nock');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Media = require('../../src/models/Media');
const Reading = require('../../src/models/Reading');
const { processReading } = require('../../src/jobs/processReading');

describe('processReading job', () => {
  let user, cow;

  beforeAll(async () => { await connect(); });
  beforeEach(async () => {
    user = await User.create({ email: 'job@example.com', name: 'Job', role: 'staff', status: 'active', passwordHash: 'x' });
    cow = await Cow.create({ cowId: '4417' });
  });
  afterEach(async () => { await clearDatabase(); nock.cleanAll(); });
  afterAll(async () => { await closeDatabase(); });

  async function makeProcessingReading() {
    const media = await Media.create({ storageKey: 'does-not-need-to-exist.jpg', mimeType: 'image/jpeg', size: 10 });
    return Reading.create({ cow: cow._id, media: media._id, status: 'processing', capturedAt: new Date(), createdBy: user._id });
  }

  it('scores a reading and denormalizes onto the cow when providers agree', async () => {
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, {
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 3.25, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 3.5, confidence: 'High', status: 'success', error_message: null },
    });

    const reading = await makeProcessingReading();
    // storageService.readFile is bypassed by mocking fs read via a real temp file:
    const { absolutePath } = require('../../src/services/storageService');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(absolutePath('does-not-need-to-exist.jpg')), { recursive: true });
    fs.writeFileSync(absolutePath('does-not-need-to-exist.jpg'), Buffer.from('fake'));

    await processReading(reading._id.toString());

    const updated = await Reading.findById(reading._id);
    expect(updated.status).toBe('scored');
    expect(updated.score).toBe(3.25);
    expect(updated.confidence).toBe('high');
    expect(updated.flagged).toBe(false);
    expect(updated.reviewStatus).toBe('not_required');
    expect(updated.providerResults).toHaveLength(3);

    const updatedCow = await Cow.findById(cow._id);
    expect(updatedCow.latestScore).toBe(3.25);
    expect(updatedCow.latestBand).toBe('ideal');
    expect(updatedCow.flagged).toBe(false);
  });

  it('flags the reading as pending review on a sharp drop from the previous reading', async () => {
    const prevMedia = await Media.create({ storageKey: 'prev.jpg', mimeType: 'image/jpeg', size: 10 });
    await Reading.create({
      cow: cow._id, media: prevMedia._id, status: 'scored', score: 3.5, band: 'ideal', confidence: 'high',
      reviewStatus: 'not_required', capturedAt: new Date(Date.now() - 86400000), createdBy: user._id,
    });
    await Cow.findByIdAndUpdate(cow._id, { latestScore: 3.5, lastScoredAt: new Date(Date.now() - 86400000) });

    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, {
      claude: { final_bcs: 2.75, confidence: 'High', status: 'success', error_message: null },
      gemini: { final_bcs: 2.75, confidence: 'High', status: 'success', error_message: null },
      openai: { final_bcs: 2.75, confidence: 'High', status: 'success', error_message: null },
    });

    const reading = await makeProcessingReading();
    const { absolutePath } = require('../../src/services/storageService');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(absolutePath('does-not-need-to-exist.jpg')), { recursive: true });
    fs.writeFileSync(absolutePath('does-not-need-to-exist.jpg'), Buffer.from('fake'));

    await processReading(reading._id.toString());

    const updated = await Reading.findById(reading._id);
    expect(updated.flagged).toBe(true);
    expect(updated.reviewStatus).toBe('pending');
    expect(updated.flagReason).toMatch(/dropped/i);
  });

  it('marks the reading as failed when every provider errors', async () => {
    nock(config.aiBackendUrl).post('/api/bcs/assess').reply(200, {
      claude: { status: 'error', error_message: 'timeout' },
      gemini: { status: 'error', error_message: 'timeout' },
      openai: { status: 'error', error_message: 'timeout' },
    });

    const reading = await makeProcessingReading();
    const { absolutePath } = require('../../src/services/storageService');
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(absolutePath('does-not-need-to-exist.jpg')), { recursive: true });
    fs.writeFileSync(absolutePath('does-not-need-to-exist.jpg'), Buffer.from('fake'));

    await processReading(reading._id.toString());

    const updated = await Reading.findById(reading._id);
    expect(updated.status).toBe('failed');
    expect(updated.errorMessage).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/processReading.test.js`
Expected: FAIL — assertions fail because the stub job just logs a warning

- [ ] **Step 3: Write the real `src/jobs/processReading.js`**

```js
const Reading = require('../models/Reading');
const Cow = require('../models/Cow');
const Media = require('../models/Media');
const { readFile } = require('../services/storageService');
const { assessImage } = require('../services/aiBackendClient');
const { reconcileProviders, bandFor, isSharpDrop } = require('../services/scoringService');

async function findPreviousScoredReading(cowId, currentReadingId) {
  return Reading.findOne({
    cow: cowId, status: 'scored', _id: { $ne: currentReadingId },
  }).sort({ capturedAt: -1 });
}

async function processReading(readingId) {
  const reading = await Reading.findById(readingId);
  if (!reading) return;

  try {
    const media = await Media.findById(reading.media);
    const buffer = await readFile(media.storageKey);
    const aiResponse = await assessImage({ buffer, mimeType: media.mimeType, filename: media.originalName || 'image.jpg' });
    const result = reconcileProviders(aiResponse);

    if (result.status === 'failed') {
      reading.status = 'failed';
      reading.errorMessage = result.errorMessage;
      reading.providerResults = result.providerResults;
      await reading.save();
      return;
    }

    const previous = await findPreviousScoredReading(reading.cow, reading._id);
    const sharpDrop = isSharpDrop(previous ? previous.score : null, result.score);
    const band = bandFor(result.score);
    const flagged = result.flagged || sharpDrop;
    let flagReason = result.flagReason;
    if (sharpDrop) {
      const dropAmount = (previous.score - result.score).toFixed(2);
      flagReason = flagReason
        ? `${flagReason} Dropped ${dropAmount} pts since last reading.`
        : `Dropped ${dropAmount} pts since last reading.`;
    }

    reading.status = 'scored';
    reading.score = result.score;
    reading.confidence = result.confidence;
    reading.band = band;
    reading.spread = result.spread;
    reading.providerResults = result.providerResults;
    reading.flagged = flagged;
    reading.flagReason = flagReason;
    reading.reviewStatus = flagged ? 'pending' : 'not_required';
    await reading.save();

    await Cow.findByIdAndUpdate(reading.cow, {
      latestScore: result.score,
      latestBand: band,
      latestConfidence: result.confidence,
      lastScoredAt: reading.capturedAt,
      flagged,
      sharpDrop,
      dropAmount: sharpDrop ? Number((previous.score - result.score).toFixed(2)) : null,
    });
  } catch (err) {
    reading.status = 'failed';
    reading.errorMessage = err.message;
    await reading.save();
  }
}

module.exports = { processReading };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/processReading.test.js`
Expected: PASS, 3 tests

- [ ] **Step 5: Re-run Task 16's test to confirm the mock there still isolates correctly**

Run: `cd backend && npx jest tests/integration/readings.test.js tests/integration/processReading.test.js`
Expected: PASS, all tests (the `readings.test.js` mock of `src/jobs/processReading` still intercepts the module before this task's real implementation runs, since Jest mocks are per-test-file)

- [ ] **Step 6: Commit**

```bash
git add backend/src/jobs/processReading.js backend/tests/integration/processReading.test.js
git commit -m "feat(backend): implement processReading job with ai-backend scoring and sharp-drop detection"
```

---

### Task 18: GET /api/readings/:id (poll) + media serving

**Files:**
- Modify: `backend/src/controllers/readingController.js`
- Modify: `backend/src/routes/readingRoutes.js`
- Test: `backend/tests/integration/readings.test.js`

**Interfaces:**
- Consumes: `Reading`, `Media` models, `storageService.absolutePath`.
- Produces: `GET /api/readings/:id` → full reading JSON (frontend's poll target). `GET /api/readings/:id/media` → streams the stored file (auth-gated).

- [ ] **Step 1: Append the failing test to `tests/integration/readings.test.js`**

```js
describe('GET /api/readings/:id and /media', () => {
  let app, token, cow, media, reading;
  const Cow = require('../../src/models/Cow');
  const Media = require('../../src/models/Media');
  const Reading = require('../../src/models/Reading');
  const fs = require('fs');
  const { absolutePath, saveFile } = require('../../src/services/storageService');

  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'poll@example.com', name: 'Poll', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowId: '5000' });
    const saved = await saveFile(Buffer.from('fake-bytes'), 'photo.jpg');
    media = await Media.create({ storageKey: saved.storageKey, mimeType: 'image/jpeg', size: saved.size });
    reading = await Reading.create({
      cow: cow._id, media: media._id, status: 'scored', score: 3.25, band: 'ideal', confidence: 'high',
      reviewStatus: 'not_required', capturedAt: new Date(), createdBy: user._id,
    });
  });
  afterEach(async () => { await clearDatabase(); jest.clearAllMocks(); });

  it('returns the reading by id', async () => {
    const res = await request(app).get(`/api/readings/${reading._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.reading.score).toBe(3.25);
    expect(res.body.reading.cowId).toBe('5000');
  });

  it('returns 404 for an unknown reading id', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app).get(`/api/readings/${fakeId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('streams the underlying media file', async () => {
    const res = await request(app).get(`/api/readings/${reading._id}/media`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('fake-bytes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/readings.test.js`
Expected: FAIL — 404 on the new GET routes

- [ ] **Step 3: Extend `src/controllers/readingController.js`**

```js
const Reading = require('../models/Reading');
const Media = require('../models/Media');
const Cow = require('../models/Cow');
const { absolutePath } = require('../services/storageService');

function serializeReading(reading, cow) {
  return {
    id: reading._id.toString(),
    cowId: cow.cowId,
    status: reading.status,
    score: reading.score,
    confidence: reading.confidence,
    band: reading.band,
    flagged: reading.flagged,
    flagReason: reading.flagReason,
    reviewStatus: reading.reviewStatus,
    spread: reading.spread,
    providerResults: reading.providerResults,
    errorMessage: reading.errorMessage,
    capturedAt: reading.capturedAt,
  };
}

async function getOne(req, res, next) {
  try {
    const reading = await Reading.findById(req.params.id);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });
    const cow = await Cow.findById(reading.cow);
    res.json({ reading: serializeReading(reading, cow) });
  } catch (err) {
    next(err);
  }
}

async function getMedia(req, res, next) {
  try {
    const reading = await Reading.findById(req.params.id);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });
    const media = await Media.findById(reading.media);
    if (!media) return res.status(404).json({ error: 'Media not found.' });
    res.setHeader('Content-Type', media.mimeType);
    res.sendFile(absolutePath(media.storageKey));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, getMedia, uploadMiddleware: upload.single('file'), serializeReading };
```

(Merge this with the existing `create`/`upload` code from Task 16 — the `module.exports` line replaces the old one.)

- [ ] **Step 4: Extend `src/routes/readingRoutes.js`**

```js
router.get('/:id', requireAuth(), readingController.getOne);
router.get('/:id/media', requireAuth(), readingController.getMedia);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/readings.test.js`
Expected: PASS, 6 tests total

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/readingController.js backend/src/routes/readingRoutes.js backend/tests/integration/readings.test.js
git commit -m "feat(backend): add reading poll endpoint and media streaming"
```

---

### Task 19: Herd list + cow reading history

**Files:**
- Modify: `backend/src/controllers/cowController.js`
- Modify: `backend/src/routes/cowRoutes.js`
- Test: `backend/tests/integration/cows.test.js`

**Interfaces:**
- Consumes: `Cow`, `Reading` models.
- Produces: `GET /api/cows?search=&filter=&sort=&page=&limit=` → `{cows, total}`. `GET /api/cows/:cowId/readings?page=&limit=` → `{readings, total}`.

- [ ] **Step 1: Append the failing tests to `tests/integration/cows.test.js`**

```js
describe('GET /api/cows (herd list)', () => {
  let app, token;
  const Reading = require('../../src/models/Reading');
  const Media = require('../../src/models/Media');

  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'herd@example.com', name: 'Herd', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    await Cow.create({ cowId: '1001', latestScore: 2.0, latestBand: 'thin', flagged: false, lastScoredAt: new Date('2026-07-01') });
    await Cow.create({ cowId: '1002', latestScore: 3.5, latestBand: 'ideal', flagged: true, lastScoredAt: new Date('2026-07-10') });
    await Cow.create({ cowId: '1003', latestScore: 4.5, latestBand: 'heavy', flagged: false, lastScoredAt: new Date('2026-07-05') });
  });
  afterEach(async () => { await clearDatabase(); });

  it('lists all cows sorted by most recently scored by default', async () => {
    const res = await request(app).get('/api/cows').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1002', '1003', '1001']);
    expect(res.body.total).toBe(3);
  });

  it('filters by flagged', async () => {
    const res = await request(app).get('/api/cows?filter=flagged').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1002']);
  });

  it('filters by band', async () => {
    const res = await request(app).get('/api/cows?filter=thin').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1001']);
  });

  it('searches by cowId substring', async () => {
    const res = await request(app).get('/api/cows?search=100').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.length).toBe(3);
    const res2 = await request(app).get('/api/cows?search=1002').set('Authorization', `Bearer ${token}`);
    expect(res2.body.cows.map((c) => c.cowId)).toEqual(['1002']);
  });

  it('sorts bcs-asc', async () => {
    const res = await request(app).get('/api/cows?sort=bcs-asc').set('Authorization', `Bearer ${token}`);
    expect(res.body.cows.map((c) => c.cowId)).toEqual(['1001', '1002', '1003']);
  });
});

describe('GET /api/cows/:cowId/readings', () => {
  let app, token, cow;
  const Reading = require('../../src/models/Reading');
  const Media = require('../../src/models/Media');

  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'hist@example.com', name: 'Hist', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowId: '2002' });
    const media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'high', capturedAt: new Date('2026-07-01'), createdBy: user._id });
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.25, band: 'ideal', confidence: 'high', capturedAt: new Date('2026-07-10'), createdBy: user._id });
  });
  afterEach(async () => { await clearDatabase(); });

  it('returns readings for a cow, most recent first', async () => {
    const res = await request(app).get(`/api/cows/${cow.cowId}/readings`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.readings.length).toBe(2);
    expect(res.body.readings[0].score).toBe(3.25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/cows.test.js`
Expected: FAIL — 404 on `/api/cows` (list route not defined) and `/api/cows/:cowId/readings`

- [ ] **Step 3: Extend `src/controllers/cowController.js`**

```js
const Reading = require('../models/Reading');
const { serializeReading } = require('./readingController');

async function list(req, res, next) {
  try {
    const { search, filter, sort, page = 1, limit = 100 } = req.query;
    const query = {};
    if (search && search.trim()) query.cowId = { $regex: search.trim(), $options: 'i' };
    if (filter === 'flagged') query.flagged = true;
    else if (['thin', 'ideal', 'heavy'].includes(filter)) query.latestBand = filter;

    let sortSpec = { lastScoredAt: -1 };
    if (sort === 'bcs-asc') sortSpec = { latestScore: 1 };
    else if (sort === 'bcs-desc') sortSpec = { latestScore: -1 };
    else if (sort === 'flagged') sortSpec = { flagged: -1, lastScoredAt: -1 };

    const total = await Cow.countDocuments(query);
    const cows = await Cow.find(query)
      .sort(sortSpec)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ cows: cows.map(serializeCow), total });
  } catch (err) {
    next(err);
  }
}

async function readings(req, res, next) {
  try {
    const cow = await Cow.findOne({ cowId: req.params.cowId });
    if (!cow) return res.status(404).json({ error: 'Cow not found.' });
    const { page = 1, limit = 100 } = req.query;
    const total = await Reading.countDocuments({ cow: cow._id });
    const docs = await Reading.find({ cow: cow._id })
      .sort({ capturedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    res.json({ readings: docs.map((r) => serializeReading(r, cow)), total });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, update, list, readings, serializeCow };
```

**Note:** this creates a circular import risk (`cowController` requires `readingController`'s `serializeReading`, and `readingController` doesn't import `cowController`) — safe as written since the dependency is one-directional.

- [ ] **Step 4: Extend `src/routes/cowRoutes.js`**

```js
router.get('/', requireAuth(), cowController.list);
router.get('/:cowId/readings', requireAuth(), cowController.readings);
```

Place `router.get('/', ...)` and the `/readings` route **before** `router.get('/:cowId', ...)` is fine in Express since `/:cowId/readings` and `/` don't collide with the `:cowId` pattern — but double check route order in the file: list `/`, then `/:cowId/readings`, then `/:cowId`, then `/:cowId` PATCH, so the more specific `/readings` suffix always matches first.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/cows.test.js`
Expected: PASS, all tests (5 from Task 12 + 6 new)

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/cowController.js backend/src/routes/cowRoutes.js backend/tests/integration/cows.test.js
git commit -m "feat(backend): add herd listing with search/filter/sort and cow reading history"
```

---

### Task 20: Review queue + approve/override

**Files:**
- Create: `backend/src/models/AuditLog.js`
- Create: `backend/src/controllers/reviewController.js`
- Create: `backend/src/routes/reviewRoutes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/review.test.js`

**Interfaces:**
- Consumes: `Reading`, `Cow`, `scoringService.roundQuarter/bandFor`.
- Produces: `AuditLog` model `{cow, reading, user, action ('approved'|'overridden'), oldScore, newScore}`. Routes `GET /api/review/queue`, `POST /api/review/:readingId/approve`, `POST /api/review/:readingId/override` — used by Task 21's stats and Task 22's audit list.

- [ ] **Step 1: Write `src/models/AuditLog.js`**

```js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    cow: { type: mongoose.Schema.Types.ObjectId, ref: 'Cow', required: true },
    reading: { type: mongoose.Schema.Types.ObjectId, ref: 'Reading', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['approved', 'overridden'], required: true },
    oldScore: { type: Number, required: true },
    newScore: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
```

- [ ] **Step 2: Write the failing test `tests/integration/review.test.js`**

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Media = require('../../src/models/Media');
const Reading = require('../../src/models/Reading');
const AuditLog = require('../../src/models/AuditLog');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('Review queue', () => {
  let app, token, cow, media;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'rev@example.com', name: 'Rev', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowId: '3003' });
    media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists only pending-review readings', async () => {
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'low', flagged: true, reviewStatus: 'pending', flagReason: 'low confidence', capturedAt: new Date(), createdBy: (await User.findOne())._id });
    await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.25, band: 'ideal', confidence: 'high', flagged: false, reviewStatus: 'not_required', capturedAt: new Date(), createdBy: (await User.findOne())._id });

    const res = await request(app).get('/api/review/queue').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].reviewStatus).toBe('pending');
  });

  it('approves a reading', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'low', flagged: true, reviewStatus: 'pending', createdBy: user._id });

    const res = await request(app).post(`/api/review/${reading._id}/approve`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const updated = await Reading.findById(reading._id);
    expect(updated.reviewStatus).toBe('approved');
    expect(updated.flagged).toBe(false);

    const logs = await AuditLog.find({ reading: reading._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('approved');
    expect(logs[0].oldScore).toBe(3.0);
    expect(logs[0].newScore).toBe(3.0);
  });

  it('overrides a reading with a new score, validated to the 0.25 grid', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, band: 'ideal', confidence: 'low', flagged: true, reviewStatus: 'pending', createdBy: user._id });

    const res = await request(app).post(`/api/review/${reading._id}/override`).set('Authorization', `Bearer ${token}`).send({ score: 2.5 });
    expect(res.status).toBe(200);

    const updated = await Reading.findById(reading._id);
    expect(updated.score).toBe(2.5);
    expect(updated.band).toBe('ideal');
    expect(updated.reviewStatus).toBe('overridden');
    expect(updated.flagged).toBe(false);

    const logs = await AuditLog.find({ reading: reading._id });
    expect(logs[0]).toMatchObject({ action: 'overridden', oldScore: 3.0, newScore: 2.5 });

    const updatedCow = await Cow.findById(cow._id);
    expect(updatedCow.latestScore).toBe(2.5);
  });

  it('rejects an override score that is not on the 0.25 grid', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, reviewStatus: 'pending', createdBy: user._id });
    const res = await request(app).post(`/api/review/${reading._id}/override`).set('Authorization', `Bearer ${token}`).send({ score: 2.6 });
    expect(res.status).toBe(400);
  });

  it('rejects an override score outside [1, 5]', async () => {
    const user = await User.findOne();
    const reading = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, reviewStatus: 'pending', createdBy: user._id });
    const res = await request(app).post(`/api/review/${reading._id}/override`).set('Authorization', `Bearer ${token}`).send({ score: 5.25 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/review.test.js`
Expected: FAIL — 404s on `/api/review/*`

- [ ] **Step 4: Write `src/controllers/reviewController.js`**

```js
const Reading = require('../models/Reading');
const Cow = require('../models/Cow');
const AuditLog = require('../models/AuditLog');
const { roundQuarter, bandFor } = require('../services/scoringService');
const { serializeReading } = require('./readingController');

async function queue(req, res, next) {
  try {
    const docs = await Reading.find({ reviewStatus: 'pending' }).sort({ capturedAt: -1 });
    const cowIds = [...new Set(docs.map((d) => d.cow.toString()))];
    const cows = await Cow.find({ _id: { $in: cowIds } });
    const cowById = new Map(cows.map((c) => [c._id.toString(), c]));
    const items = docs.map((d) => serializeReading(d, cowById.get(d.cow.toString())));
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function isMostRecentScored(cowId, readingId) {
  const mostRecent = await Reading.findOne({ cow: cowId, status: 'scored' }).sort({ capturedAt: -1 });
  return mostRecent && mostRecent._id.toString() === readingId.toString();
}

async function approve(req, res, next) {
  try {
    const reading = await Reading.findById(req.params.readingId);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });

    reading.reviewStatus = 'approved';
    reading.flagged = false;
    await reading.save();

    await AuditLog.create({
      cow: reading.cow, reading: reading._id, user: req.user.id,
      action: 'approved', oldScore: reading.score, newScore: reading.score,
    });

    if (await isMostRecentScored(reading.cow, reading._id)) {
      await Cow.findByIdAndUpdate(reading.cow, { flagged: false });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function override(req, res, next) {
  try {
    const { score } = req.body;
    if (typeof score !== 'number' || score < 1 || score > 5 || roundQuarter(score) !== score) {
      return res.status(400).json({ error: 'score must be a multiple of 0.25 between 1 and 5.' });
    }
    const reading = await Reading.findById(req.params.readingId);
    if (!reading) return res.status(404).json({ error: 'Reading not found.' });

    const oldScore = reading.score;
    reading.score = score;
    reading.band = bandFor(score);
    reading.reviewStatus = 'overridden';
    reading.flagged = false;
    await reading.save();

    await AuditLog.create({
      cow: reading.cow, reading: reading._id, user: req.user.id,
      action: 'overridden', oldScore, newScore: score,
    });

    if (await isMostRecentScored(reading.cow, reading._id)) {
      await Cow.findByIdAndUpdate(reading.cow, {
        latestScore: score, latestBand: reading.band, flagged: false,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { queue, approve, override };
```

- [ ] **Step 5: Write `src/routes/reviewRoutes.js`**

```js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

router.get('/queue', requireAuth(), reviewController.queue);
router.post('/:readingId/approve', requireAuth(), reviewController.approve);
router.post('/:readingId/override', requireAuth(), reviewController.override);

module.exports = router;
```

- [ ] **Step 6: Mount it in `src/routes/index.js`**

```js
const reviewRoutes = require('./reviewRoutes');
router.use('/review', reviewRoutes);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/review.test.js`
Expected: PASS, 5 tests

- [ ] **Step 8: Commit**

```bash
git add backend/src/models/AuditLog.js backend/src/controllers/reviewController.js \
        backend/src/routes/reviewRoutes.js backend/src/routes/index.js backend/tests/integration/review.test.js
git commit -m "feat(backend): add review queue with approve/override and audit logging"
```

---

### Task 21: Review stats

**Files:**
- Modify: `backend/src/controllers/reviewController.js`
- Modify: `backend/src/routes/reviewRoutes.js`
- Test: `backend/tests/integration/review.test.js`

**Interfaces:**
- Consumes: `AuditLog` model.
- Produces: `GET /api/review/stats` → `{reviewed, approved, overridden, cowsOverridden, overrideRate, avgAdjustment}`.

- [ ] **Step 1: Append the failing test to `tests/integration/review.test.js`**

```js
describe('GET /api/review/stats', () => {
  let app, token, cowA, cowB;
  beforeAll(async () => { app = createApp(); });
  beforeEach(async () => {
    const user = await User.create({ email: 'stats@example.com', name: 'Stats', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cowA = await Cow.create({ cowId: '4004' });
    cowB = await Cow.create({ cowId: '4005' });
    const media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
    const r1 = await Reading.create({ cow: cowA._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    const r2 = await Reading.create({ cow: cowB._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    await AuditLog.create({ cow: cowA._id, reading: r1._id, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });
    await AuditLog.create({ cow: cowB._id, reading: r2._id, user: user._id, action: 'overridden', oldScore: 3.0, newScore: 2.5 });
  });
  afterEach(async () => { await clearDatabase(); });

  it('computes reviewed/approved/overridden/cowsOverridden/overrideRate/avgAdjustment', async () => {
    const res = await request(app).get('/api/review/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reviewed: 2, approved: 1, overridden: 1, cowsOverridden: 1, overrideRate: 50, avgAdjustment: 0.5,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/review.test.js`
Expected: FAIL — 404 on `/api/review/stats`

- [ ] **Step 3: Extend `src/controllers/reviewController.js`**

```js
async function stats(req, res, next) {
  try {
    const logs = await AuditLog.find();
    const reviewed = logs.length;
    const overriddenLogs = logs.filter((l) => l.action === 'overridden');
    const overridden = overriddenLogs.length;
    const approved = reviewed - overridden;
    const cowsOverridden = new Set(overriddenLogs.map((l) => l.cow.toString())).size;
    const overrideRate = reviewed ? Math.round((overridden / reviewed) * 100) : 0;
    const avgAdjustment = overridden
      ? Number((overriddenLogs.reduce((sum, l) => sum + Math.abs(l.newScore - l.oldScore), 0) / overridden).toFixed(2))
      : 0;
    res.json({ reviewed, approved, overridden, cowsOverridden, overrideRate, avgAdjustment });
  } catch (err) {
    next(err);
  }
}

module.exports = { queue, approve, override, stats };
```

- [ ] **Step 4: Add the route in `src/routes/reviewRoutes.js`**

```js
router.get('/stats', requireAuth(), reviewController.stats);
```

Place this route **above** `router.post('/:readingId/approve', ...)` — it doesn't collide (different HTTP method/path shape either way, but keeping static routes before param routes is the project convention established in Task 19).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/review.test.js`
Expected: PASS, 6 tests total

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/reviewController.js backend/src/routes/reviewRoutes.js backend/tests/integration/review.test.js
git commit -m "feat(backend): add review stats endpoint"
```

---

### Task 22: Audit log endpoint

**Files:**
- Create: `backend/src/controllers/auditController.js`
- Create: `backend/src/routes/auditRoutes.js`
- Modify: `backend/src/routes/index.js`
- Test: `backend/tests/integration/audit.test.js`

**Interfaces:**
- Consumes: `AuditLog`, `Cow` models.
- Produces: `GET /api/audit?cowId=&action=&from=&to=&page=&limit=` → `{entries, total}`, reverse chronological.

- [ ] **Step 1: Write the failing test `tests/integration/audit.test.js`**

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { connect, clearDatabase, closeDatabase } = require('../setup');
const User = require('../../src/models/User');
const Cow = require('../../src/models/Cow');
const Media = require('../../src/models/Media');
const Reading = require('../../src/models/Reading');
const AuditLog = require('../../src/models/AuditLog');
const config = require('../../src/config/env');

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtAccessSecret, { expiresIn: '15m' });
}

describe('GET /api/audit', () => {
  let app, token, cow, user;
  beforeAll(async () => { await connect(); app = createApp(); });
  beforeEach(async () => {
    user = await User.create({ email: 'audit@example.com', name: 'Audit', role: 'staff', status: 'active', passwordHash: 'x' });
    token = tokenFor(user);
    cow = await Cow.create({ cowId: '6006' });
    const media = await Media.create({ storageKey: 'x.jpg', mimeType: 'image/jpeg', size: 1 });
    const r1 = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    const r2 = await Reading.create({ cow: cow._id, media: media._id, status: 'scored', score: 3.25, createdBy: user._id });
    await AuditLog.create({ cow: cow._id, reading: r1._id, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });
    await new Promise((r) => setTimeout(r, 10));
    await AuditLog.create({ cow: cow._id, reading: r2._id, user: user._id, action: 'overridden', oldScore: 3.25, newScore: 3.0 });
  });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('lists audit entries reverse-chronologically', async () => {
    const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.entries[0].action).toBe('overridden');
    expect(res.body.entries[1].action).toBe('approved');
    expect(res.body.entries[0].cowId).toBe('6006');
  });

  it('filters by action', async () => {
    const res = await request(app).get('/api/audit?action=overridden').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('overridden');
  });

  it('filters by cowId', async () => {
    const otherCow = await Cow.create({ cowId: '7007' });
    const media = await Media.findOne();
    const r3 = await Reading.create({ cow: otherCow._id, media: media._id, status: 'scored', score: 3.0, createdBy: user._id });
    await AuditLog.create({ cow: otherCow._id, reading: r3._id, user: user._id, action: 'approved', oldScore: 3.0, newScore: 3.0 });

    const res = await request(app).get('/api/audit?cowId=7007').set('Authorization', `Bearer ${token}`);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].cowId).toBe('7007');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/integration/audit.test.js`
Expected: FAIL — 404 on `/api/audit`

- [ ] **Step 3: Write `src/controllers/auditController.js`**

```js
const AuditLog = require('../models/AuditLog');
const Cow = require('../models/Cow');

async function list(req, res, next) {
  try {
    const { cowId, action, from, to, page = 1, limit = 100 } = req.query;
    const query = {};
    if (action && ['approved', 'overridden'].includes(action)) query.action = action;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    if (cowId) {
      const cow = await Cow.findOne({ cowId });
      query.cow = cow ? cow._id : null;
    }

    const total = await AuditLog.countDocuments(query);
    const docs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const cowIds = [...new Set(docs.map((d) => d.cow.toString()))];
    const cows = await Cow.find({ _id: { $in: cowIds } });
    const cowById = new Map(cows.map((c) => [c._id.toString(), c.cowId]));

    const entries = docs.map((d) => ({
      cowId: cowById.get(d.cow.toString()),
      action: d.action,
      oldScore: d.oldScore,
      newScore: d.newScore,
      createdAt: d.createdAt,
    }));

    res.json({ entries, total });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
```

- [ ] **Step 4: Write `src/routes/auditRoutes.js`**

```js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const auditController = require('../controllers/auditController');

const router = express.Router();

router.get('/', requireAuth(), auditController.list);

module.exports = router;
```

- [ ] **Step 5: Mount it in `src/routes/index.js`**

```js
const auditRoutes = require('./auditRoutes');
router.use('/audit', auditRoutes);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest tests/integration/audit.test.js`
Expected: PASS, 3 tests

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/auditController.js backend/src/routes/auditRoutes.js \
        backend/src/routes/index.js backend/tests/integration/audit.test.js
git commit -m "feat(backend): add audit log endpoint"
```

---

### Task 23: Full-suite verification + README

**Files:**
- Create: `backend/README.md`
- Modify: `backend/src/routes/index.js` (final review only, no functional change expected)

**Interfaces:**
- Consumes: everything built in Tasks 1–22.
- Produces: nothing new — this is the final integration checkpoint.

- [ ] **Step 1: Run the entire test suite**

Run: `cd backend && npm test`
Expected: PASS — every test file from Tasks 1–22 (health, authService, aiBackendClient, scoringService, storageService, emailService, auth, users, cows, readings, processReading, review, audit)

- [ ] **Step 2: Confirm `src/routes/index.js` mounts all six route groups**

```js
const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const cowRoutes = require('./cowRoutes');
const readingRoutes = require('./readingRoutes');
const reviewRoutes = require('./reviewRoutes');
const auditRoutes = require('./auditRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/cows', cowRoutes);
router.use('/readings', readingRoutes);
router.use('/review', reviewRoutes);
router.use('/audit', auditRoutes);

module.exports = router;
```

- [ ] **Step 3: Write `backend/README.md`**

```markdown
# BCS Tracker Backend

Node/Express/MongoDB API for BCS Tracker. Integrates with the existing `ai-backend`
FastAPI service for vision scoring — see `docs/module-and-api-spec.md` at the repo root
for the full endpoint catalog and domain rules.

## Setup

    cp .env.example .env   # fill in MONGODB_URL, JWT secrets, AI_BACKEND_URL, SMTP_*
    npm install
    npm run dev

## Bootstrapping the first admin

There is no public registration. Seed the first admin directly in Mongo, e.g. via
`mongosh`, with `status: 'active'` and a bcrypt `passwordHash` — every subsequent user
is created via that admin's `POST /api/users/invite`.

## Testing

    npm test

Integration tests run against an in-memory MongoDB (`mongodb-memory-server`) and mock
both `nodemailer` and calls to `ai-backend` (`nock`) — no real SMTP or AI service
credentials are required to run the suite.
```

- [ ] **Step 4: Manual smoke check against a real ai-backend (optional but recommended before frontend integration)**

```bash
# terminal 1
cd ai-backend && uvicorn app.main:app --reload --port 8000
# terminal 2
cd backend && npm run dev
# terminal 3 — register + upload
curl -X POST http://localhost:4000/api/cows -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"cowId":"9999"}'
curl -X POST http://localhost:4000/api/readings -H "Authorization: Bearer <token>" -F cowId=9999 -F file=@/path/to/real/cow-photo.jpg
```

Expected: `202 {readingId, status:"processing"}`, then `GET /api/readings/:id` transitions to `status:"scored"` within ~5–30s.

- [ ] **Step 5: Commit**

```bash
git add backend/README.md backend/src/routes/index.js
git commit -m "docs(backend): add backend README"
```

---

## Self-Review Notes

- **Spec coverage:** every endpoint in `docs/module-and-api-spec.md` §5 is covered except OTP-specific ones, which are superseded by the email+password decision (D6 resolved). `GET /health` (Task 1). Auth: login/refresh/logout/me/accept-invite (Tasks 7–10) — `request-otp`/`verify-otp` from the original spec are dropped per the user's decision. Users: list/invite/role/remove (Tasks 6, 11). Cows: list/get/create/update/readings (Tasks 12, 19). Readings: upload/get/media (Tasks 16, 18). Review: queue/approve/override/stats (Tasks 20–21). Audit: list (Task 22).
- **Type consistency verified:** `Reading.confidence`/`Cow.latestConfidence` are lowercase (`high|medium|low`) everywhere, matching `scoringService.reconcileProviders`'s lowercasing of the ai-backend's capitalized values — checked across Tasks 14, 17, 18, 19. `roundQuarter` is defined once (Task 14) and reused by Task 20's override validation and Task 17's median rounding — never re-implemented. `serializeReading`/`serializeCow` are each defined once (Tasks 18, 12) and imported by every other controller that needs them (review, cow-readings, audit) rather than duplicated.
- **No placeholders:** confirmed — every step above has runnable code, not descriptions of code.
