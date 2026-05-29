/**
 * MathEarning - File-based JSON API server
 * Uses only Node.js built-in modules (no frameworks)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, 'database');
const MAX_QUESTIONS_STORED = 2000; // Prune old answered questions to keep DB fast

// Reward constants
const REWARD_PER_CORRECT = 0.02;
const REFERRAL_REWARD = 5.0;
const MIN_WITHDRAWAL = 100;
const RAPID_ANSWER_MS = 300; // Anti-cheat: minimum ms between answers
const MAX_ANSWERS_PER_MINUTE = 45;
const RAPID_STRIKES_BEFORE_FLAG = 5;

// Default admin (change in production) — fixed salt so hash persists across restarts
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_HASH = (() => {
  const salt = 'mathearning_admin_salt_v1';
  const hash = crypto.pbkdf2Sync('admin123', salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
})();

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

// ─── File database helpers ───────────────────────────────────────────

function dbPath(name) {
  return path.join(DB_DIR, name);
}

function readDB(name) {
  try {
    const file = dbPath(name);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(data || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`readDB(${name}) failed:`, err.message);
    return [];
  }
}

function writeDB(name, data) {
  const file = dbPath(name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function pruneQuestions(questions) {
  if (questions.length <= MAX_QUESTIONS_STORED) return questions;
  const unanswered = questions.filter(q => !q.answered);
  const answered = questions.filter(q => q.answered);
  answered.sort((a, b) => new Date(b.answeredAt || 0) - new Date(a.answeredAt || 0));
  const keepAnswered = answered.slice(0, MAX_QUESTIONS_STORED - unanswered.length);
  return [...unanswered, ...keepAnswered];
}

function pruneSessions() {
  const sessions = readDB('sessions.json');
  const now = Date.now();
  const active = sessions.filter(s => s.expiresAt > now);
  if (active.length !== sessions.length) writeDB('sessions.json', active);
}

function ensureUserDefaults(user) {
  user.balance = Number(user.balance) || 0;
  user.totalEarnings = Number(user.totalEarnings) || 0;
  user.questionsAnswered = Number(user.questionsAnswered) || 0;
  user.referralEarnings = Number(user.referralEarnings) || 0;
  user.referralCount = Number(user.referralCount) || 0;
  user.dailyEarnings = user.dailyEarnings || {};
  user.answerTimestamps = user.answerTimestamps || [];
  user.lastAnswerAt = user.lastAnswerAt || 0;
  user.suspicious = !!user.suspicious;
  user.banned = !!user.banned;
  user.rapidStrikes = user.rapidStrikes || 0;
  return user;
}

function readUsers() {
  const data = readDB('users.json');
  return Array.isArray(data) ? data : [];
}

function writeUsers(users) {
  writeDB('users.json', users);
}

function logActivity(userId, type, message, meta = {}) {
  const logs = readDB('activitylogs.json');
  logs.unshift({
    id: crypto.randomUUID(),
    userId,
    type,
    message,
    meta,
    timestamp: new Date().toISOString()
  });
  if (logs.length > 5000) logs.length = 5000;
  writeDB('activitylogs.json', logs);
}

// ─── Password hashing ────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !password || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verify;
  } catch {
    return false;
  }
}

// ─── Session management ──────────────────────────────────────────────

function createSession(userId, isAdmin = false) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = readDB('sessions.json');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  sessions.push({ token, userId, isAdmin, expiresAt, createdAt: new Date().toISOString() });
  writeDB('sessions.json', sessions);
  return { token, expiresAt };
}

function getSession(token) {
  if (!token) return null;
  const sessions = readDB('sessions.json');
  const now = Date.now();
  const session = sessions.find(s => s.token === token && s.expiresAt > now);
  if (!session) return null;
  return session;
}

function destroySession(token) {
  const sessions = readDB('sessions.json');
  writeDB('sessions.json', sessions.filter(s => s.token !== token));
}

function getUserById(id) {
  const user = readUsers().find(u => u.id === id && !u.banned);
  return user ? ensureUserDefaults(user) : null;
}

function getUserByUsername(username) {
  return readUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

// ─── Math question generation (server-side) ──────────────────────────

const OPERATORS = ['+', '-', '*', '/'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateNumber() {
  const digits = randomInt(4, 7);
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return randomInt(min, max);
}

function evaluate(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b !== 0 ? a / b : null;
    default: return null;
  }
}

function questionKey(a, op, b) {
  return `${a}${op}${b}`;
}

function generateUniqueQuestion(userId) {
  const globalQuestions = readDB('questions.json');
  const usedKeys = new Set(globalQuestions.map(q => q.key));
  const userQuestions = globalQuestions.filter(q => q.userId === userId);
  const userUsed = new Set(userQuestions.map(q => q.key));

  let attempts = 0;
  while (attempts < 500) {
    attempts++;
    let a = generateNumber();
    let b = generateNumber();
    const op = OPERATORS[randomInt(0, OPERATORS.length - 1)];

    if (op === '/' && b === 0) continue;
    if (op === '-' && a < b) [a, b] = [b, a];
    if (op === '/') {
      // Ensure clean division
      b = randomInt(1000, 99999);
      a = b * randomInt(2, 500);
    }

    const answer = evaluate(a, op, b);
    if (answer === null || !Number.isFinite(answer)) continue;

    const rounded = Math.round(answer * 100) / 100;
    const key = questionKey(a, op, b);

    if (usedKeys.has(key) || userUsed.has(key)) continue;

    const questionId = crypto.randomUUID();
    const record = {
      id: questionId,
      userId,
      key,
      a,
      b,
      operator: op,
      correctAnswer: rounded,
      issuedAt: new Date().toISOString(),
      answered: false,
      rewarded: false
    };

    globalQuestions.push(record);
    writeDB('questions.json', pruneQuestions(globalQuestions));

    return {
      id: questionId,
      expression: `${a} ${op} ${b}`,
      operator: op
    };
  }

  return null;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/mathearning_token=([^;]+)/);
  return match ? match[1] : null;
}

function requireAuth(req, res) {
  const token = getToken(req);
  const session = getSession(token);
  if (!session) {
    sendJSON(res, 401, { error: 'Unauthorized' });
    return null;
  }
  const user = getUserById(session.userId);
  if (!user && !session.isAdmin) {
    sendJSON(res, 401, { error: 'User not found or banned' });
    return null;
  }
  return { session, user, token };
}

/** Require a regular user session (blocks admin tokens on user-only routes) */
function requireUserAuth(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.session.isAdmin || !auth.user) {
    sendJSON(res, 403, { error: 'User account required' });
    return null;
  }
  return auth;
}

// ─── API routes ────────────────────────────────────────────────────────

async function handleAPI(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    try {
      body = await parseBody(req);
    } catch {
      return sendJSON(res, 400, { error: 'Invalid request body' });
    }
  }

  // ── Register ──
  if (pathname === '/api/register' && req.method === 'POST') {
    const { fullName, username, email, password, referralCode, deviceFingerprint } = body;

    if (!fullName || !username || !email || !password) {
      return sendJSON(res, 400, { error: 'All fields are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJSON(res, 400, { error: 'Invalid email format' });
    }
    if (username.length < 3 || password.length < 6) {
      return sendJSON(res, 400, { error: 'Username min 3 chars, password min 6 chars' });
    }
    if (username.toLowerCase() === ADMIN_USERNAME) {
      return sendJSON(res, 400, { error: 'Username "admin" is reserved' });
    }

    const users = readUsers();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return sendJSON(res, 409, { error: 'Username already taken' });
    }
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return sendJSON(res, 409, { error: 'Email already registered' });
    }

    const user = {
      id: crypto.randomUUID(),
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashPassword(password),
      balance: 0,
      totalEarnings: 0,
      questionsAnswered: 0,
      referralEarnings: 0,
      referralCount: 0,
      referredBy: null,
      banned: false,
      suspicious: false,
      lastAnswerAt: 0,
      answerTimestamps: [],
      dailyEarnings: {},
      createdAt: new Date().toISOString()
    };

    // Handle referral on registration
    if (referralCode) {
      const referrer = users.find(u => u.username.toLowerCase() === referralCode.toLowerCase());
      if (referrer) {
        user.referredBy = referrer.id;
      }
    }

    users.push(user);
    writeUsers(users);
    logActivity(user.id, 'register', 'Account created');

    const { token, expiresAt } = createSession(user.id);
    return sendJSON(res, 201, {
      success: true,
      token,
      expiresAt,
      user: sanitizeUser(user)
    });
  }

  // ── Login ──
  if (pathname === '/api/login' && req.method === 'POST') {
    const { username, password, loginType } = body;
    if (!username || !password) {
      return sendJSON(res, 400, { error: 'Username and password required' });
    }

    const wantsAdmin = loginType === 'admin';
    const wantsUser = loginType === 'user' || !loginType;

    // Admin login (only when loginType is admin)
    if (wantsAdmin) {
      if (username !== ADMIN_USERNAME || !verifyPassword(password, ADMIN_PASSWORD_HASH)) {
        return sendJSON(res, 401, { error: 'Invalid admin credentials' });
      }
      const { token, expiresAt } = createSession('admin', true);
      return sendJSON(res, 200, { success: true, token, expiresAt, isAdmin: true });
    }

    // Block admin username on user login page
    if (wantsUser && username.toLowerCase() === ADMIN_USERNAME) {
      return sendJSON(res, 403, { error: 'Use the Admin Login page for admin access' });
    }

    const user = getUserByUsername(username) || readUsers().find(u => u.email === username.toLowerCase());
    if (!user || user.banned) {
      return sendJSON(res, 401, { error: 'Invalid credentials or account banned' });
    }
    if (!verifyPassword(password, user.password)) {
      return sendJSON(res, 401, { error: 'Invalid credentials' });
    }

    const { token, expiresAt } = createSession(user.id);
    logActivity(user.id, 'login', 'User logged in');
    return sendJSON(res, 200, { success: true, token, expiresAt, user: sanitizeUser(user) });
  }

  // ── Logout ──
  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = getToken(req);
    if (token) destroySession(token);
    return sendJSON(res, 200, { success: true });
  }

  // ── Session / Profile ──
  if (pathname === '/api/me' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if (auth.session.isAdmin) {
      return sendJSON(res, 200, { isAdmin: true, username: 'admin' });
    }
    if (!auth.user) {
      return sendJSON(res, 401, { error: 'Session invalid. Please log in again.' });
    }
    const users = readUsers();
    const fresh = users.find(u => u.id === auth.user.id);
    if (!fresh || fresh.banned) {
      return sendJSON(res, 401, { error: 'User not found or banned' });
    }
    return sendJSON(res, 200, { user: sanitizeUser(ensureUserDefaults(fresh)) });
  }

  // ── Update settings ──
  if (pathname === '/api/settings' && req.method === 'PUT') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;
    const { fullName, email, currentPassword, newPassword } = body;
    const users = readUsers();
    const idx = users.findIndex(u => u.id === auth.user.id);
    if (idx === -1) return sendJSON(res, 404, { error: 'User not found' });

    if (fullName) users[idx].fullName = fullName.trim();
    if (email && email !== users[idx].email) {
      if (users.some(u => u.email === email.toLowerCase() && u.id !== auth.user.id)) {
        return sendJSON(res, 409, { error: 'Email already in use' });
      }
      users[idx].email = email.trim().toLowerCase();
    }
    if (newPassword) {
      if (!currentPassword) {
        return sendJSON(res, 400, { error: 'Current password is required to set a new password' });
      }
      if (!verifyPassword(currentPassword, users[idx].password)) {
        return sendJSON(res, 401, { error: 'Current password incorrect' });
      }
      if (newPassword.length < 6) {
        return sendJSON(res, 400, { error: 'New password must be at least 6 characters' });
      }
      users[idx].password = hashPassword(newPassword);
    }
    writeUsers(users);
    logActivity(auth.user.id, 'settings', 'Account settings updated');
    return sendJSON(res, 200, { success: true, user: sanitizeUser(users[idx]) });
  }

  // ── Get math question ──
  if (pathname === '/api/question' && req.method === 'POST') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;

    const users = readUsers();
    const user = users.find(u => u.id === auth.user.id);
    if (!user) return sendJSON(res, 404, { error: 'User not found' });
    if (user.suspicious) {
      return sendJSON(res, 403, { error: 'Account flagged for review. Contact support or wait for admin reset.' });
    }

    const question = generateUniqueQuestion(auth.user.id);
    if (!question) {
      return sendJSON(res, 503, { error: 'Could not generate unique question. Try again.' });
    }
    return sendJSON(res, 200, { question });
  }

  // ── Submit answer (server-side validation) ──
  if (pathname === '/api/answer' && req.method === 'POST') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;

    const { questionId, answer, clientTimestamp } = body;
    if (!questionId || answer === undefined || answer === '') {
      return sendJSON(res, 400, { error: 'Question ID and answer required' });
    }

    const questions = readDB('questions.json');
    const qIdx = questions.findIndex(q => q.id === questionId && q.userId === auth.user.id);
    if (qIdx === -1) {
      return sendJSON(res, 404, { error: 'Invalid question' });
    }

    const question = questions[qIdx];
    if (question.answered) {
      return sendJSON(res, 409, { error: 'Question already answered' });
    }

    const users = readUsers();
    const uIdx = users.findIndex(u => u.id === auth.user.id);
    if (uIdx === -1) return sendJSON(res, 404, { error: 'User not found' });

    const now = Date.now();

    // Anti-cheat: rapid answering detection (warn first, flag after repeated strikes)
    if (users[uIdx].lastAnswerAt && now - users[uIdx].lastAnswerAt < RAPID_ANSWER_MS) {
      users[uIdx].rapidStrikes = (users[uIdx].rapidStrikes || 0) + 1;
      if (users[uIdx].rapidStrikes >= RAPID_STRIKES_BEFORE_FLAG) {
        users[uIdx].suspicious = true;
        logActivity(auth.user.id, 'cheat', 'Rapid answering detected', { questionId });
      }
      writeUsers(users);
      return sendJSON(res, 429, { error: 'Answering too fast. Wait a moment.' });
    }
    users[uIdx].rapidStrikes = 0;

    users[uIdx].answerTimestamps = (users[uIdx].answerTimestamps || []).filter(t => now - t < 60000);
    users[uIdx].answerTimestamps.push(now);
    if (users[uIdx].answerTimestamps.length > MAX_ANSWERS_PER_MINUTE) {
      users[uIdx].suspicious = true;
      writeUsers(users);
      return sendJSON(res, 429, { error: 'Too many answers per minute. Take a short break.' });
    }

    const parsedAnswer = parseFloat(answer);
    if (isNaN(parsedAnswer)) {
      return sendJSON(res, 400, { error: 'Invalid answer format' });
    }

    const correct = Math.abs(parsedAnswer - question.correctAnswer) < 0.01;
    questions[qIdx].answered = true;
    questions[qIdx].answeredAt = new Date().toISOString();
    questions[qIdx].userAnswer = parsedAnswer;
    questions[qIdx].wasCorrect = correct;

    let earned = 0;
    if (correct && !question.rewarded) {
      questions[qIdx].rewarded = true;
      earned = REWARD_PER_CORRECT;
      users[uIdx].balance = Math.round((users[uIdx].balance + earned) * 100) / 100;
      users[uIdx].totalEarnings = Math.round((users[uIdx].totalEarnings + earned) * 100) / 100;
      users[uIdx].questionsAnswered += 1;

      const today = new Date().toISOString().split('T')[0];
      users[uIdx].dailyEarnings = users[uIdx].dailyEarnings || {};
      users[uIdx].dailyEarnings[today] = Math.round(((users[uIdx].dailyEarnings[today] || 0) + earned) * 100) / 100;

      logActivity(auth.user.id, 'earn', `Earned ₱${earned.toFixed(2)} from correct answer`, { questionId, earned });
    }

    users[uIdx].lastAnswerAt = now;
    writeUsers(users);
    writeDB('questions.json', pruneQuestions(questions));

    return sendJSON(res, 200, {
      correct,
      earned,
      balance: users[uIdx].balance,
      totalEarnings: users[uIdx].totalEarnings,
      questionsAnswered: users[uIdx].questionsAnswered
    });
  }

  // ── Referral click tracking ──
  if (pathname === '/api/referral/click' && req.method === 'POST') {
    const { referrerUsername, deviceFingerprint } = body;
    if (!referrerUsername || !deviceFingerprint) {
      return sendJSON(res, 400, { error: 'Referrer and device fingerprint required' });
    }

    const users = readUsers();
    const referrer = users.find(u => u.username.toLowerCase() === referrerUsername.toLowerCase());
    if (!referrer) {
      return sendJSON(res, 404, { error: 'Referrer not found' });
    }

    const referrals = readDB('referrals.json');
    const existing = referrals.find(
      r => r.deviceFingerprint === deviceFingerprint && r.referrerId === referrer.id
    );
    if (existing) {
      return sendJSON(res, 200, { success: true, alreadyCounted: true, message: 'Click already recorded for this device' });
    }

    referrals.push({
      id: crypto.randomUUID(),
      referrerId: referrer.id,
      referrerUsername: referrer.username,
      deviceFingerprint,
      reward: REFERRAL_REWARD,
      clickedAt: new Date().toISOString(),
      converted: false
    });
    writeDB('referrals.json', referrals);

    const rIdx = users.findIndex(u => u.id === referrer.id);
    users[rIdx].balance = Math.round((users[rIdx].balance + REFERRAL_REWARD) * 100) / 100;
    users[rIdx].referralEarnings = Math.round((users[rIdx].referralEarnings + REFERRAL_REWARD) * 100) / 100;
    users[rIdx].referralCount += 1;
    users[rIdx].totalEarnings = Math.round((users[rIdx].totalEarnings + REFERRAL_REWARD) * 100) / 100;

    const today = new Date().toISOString().split('T')[0];
    users[rIdx].dailyEarnings = users[rIdx].dailyEarnings || {};
    users[rIdx].dailyEarnings[today] = Math.round(((users[rIdx].dailyEarnings[today] || 0) + REFERRAL_REWARD) * 100) / 100;

    writeUsers(users);
    logActivity(referrer.id, 'referral', `Referral click reward ₱${REFERRAL_REWARD}`, { deviceFingerprint });

    return sendJSON(res, 200, { success: true, reward: REFERRAL_REWARD });
  }

  // ── Referral on register conversion ──
  if (pathname === '/api/referral/convert' && req.method === 'POST') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;
    // Conversion tracked via referredBy on user - no extra reward on register per spec (click = reward)
    return sendJSON(res, 200, { success: true });
  }

  // ── Withdrawal request ──
  if (pathname === '/api/withdraw' && req.method === 'POST') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;

    const { fullName, gcashNumber, amount } = body;
    const withdrawAmount = parseFloat(amount);

    if (!fullName || !gcashNumber || !withdrawAmount) {
      return sendJSON(res, 400, { error: 'All withdrawal fields required' });
    }
    if (!/^09\d{9}$/.test(gcashNumber.replace(/\s/g, ''))) {
      return sendJSON(res, 400, { error: 'Invalid GCash number (use 09XXXXXXXXX)' });
    }
    if (withdrawAmount < MIN_WITHDRAWAL) {
      return sendJSON(res, 400, { error: `Minimum withdrawal is ₱${MIN_WITHDRAWAL}` });
    }

    const users = readUsers();
    const uIdx = users.findIndex(u => u.id === auth.user.id);
    if (users[uIdx].balance < withdrawAmount) {
      return sendJSON(res, 400, { error: 'Insufficient balance' });
    }

    const withdrawals = readDB('withdrawals.json');
    const pending = withdrawals.find(
      w => w.userId === auth.user.id && w.status === 'pending'
    );
    if (pending) {
      return sendJSON(res, 409, { error: 'You already have a pending withdrawal' });
    }

    users[uIdx].balance = Math.round((users[uIdx].balance - withdrawAmount) * 100) / 100;
    writeUsers(users);

    const withdrawal = {
      id: crypto.randomUUID(),
      userId: auth.user.id,
      username: users[uIdx].username,
      fullName: fullName.trim(),
      gcashNumber: gcashNumber.replace(/\s/g, ''),
      amount: withdrawAmount,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      processedAt: null
    };

    withdrawals.push(withdrawal);
    writeDB('withdrawals.json', withdrawals);
    logActivity(auth.user.id, 'withdraw', `Withdrawal requested ₱${withdrawAmount}`, { withdrawalId: withdrawal.id });

    return sendJSON(res, 200, { success: true, withdrawal, balance: users[uIdx].balance });
  }

  // ── User withdrawals history ──
  if (pathname === '/api/withdrawals' && req.method === 'GET') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;
    const withdrawals = readDB('withdrawals.json');
    const mine = withdrawals.filter(w => w.userId === auth.user.id).reverse();
    return sendJSON(res, 200, { withdrawals: mine });
  }

  // ── Activity logs ──
  if (pathname === '/api/activity' && req.method === 'GET') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;
    const logs = readDB('activitylogs.json');
    const mine = logs.filter(l => l.userId === auth.user.id).slice(0, 20);
    return sendJSON(res, 200, { activity: mine });
  }

  // ── Leaderboard ──
  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const users = readUsers()
      .filter(u => !u.banned)
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 10)
      .map((u, i) => ({
        rank: i + 1,
        username: u.username,
        totalEarnings: u.totalEarnings,
        questionsAnswered: u.questionsAnswered
      }));
    return sendJSON(res, 200, { leaderboard: users });
  }

  // ── Daily stats ──
  if (pathname === '/api/stats/daily' && req.method === 'GET') {
    const auth = requireUserAuth(req, res);
    if (!auth) return;
    const users = readUsers();
    const user = users.find(u => u.id === auth.user.id);
    if (!user) return sendJSON(res, 404, { error: 'User not found' });
    const daily = user.dailyEarnings || {};
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      last7.push({ date: key, earnings: daily[key] || 0 });
    }
    return sendJSON(res, 200, { stats: last7 });
  }

  // ═══ ADMIN ROUTES ═══

  if (pathname.startsWith('/api/admin')) {
    const token = getToken(req);
    const session = getSession(token);
    if (!session || !session.isAdmin) {
      return sendJSON(res, 403, { error: 'Admin access required' });
    }

    if (pathname === '/api/admin/users' && req.method === 'GET') {
      const users = readUsers().map(sanitizeUser);
      return sendJSON(res, 200, { users });
    }

    if (pathname === '/api/admin/withdrawals' && req.method === 'GET') {
      return sendJSON(res, 200, { withdrawals: readDB('withdrawals.json') });
    }

    if (pathname === '/api/admin/referrals' && req.method === 'GET') {
      return sendJSON(res, 200, { referrals: readDB('referrals.json') });
    }

    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      const users = readUsers();
      const withdrawals = readDB('withdrawals.json');
      const referrals = readDB('referrals.json');
      return sendJSON(res, 200, {
        totalUsers: users.length,
        totalEarnings: users.reduce((s, u) => s + (Number(u.totalEarnings) || 0), 0),
        totalBalance: users.reduce((s, u) => s + (Number(u.balance) || 0), 0),
        pendingWithdrawals: withdrawals.filter(w => w.status === 'pending').length,
        totalReferrals: referrals.length
      });
    }

    if (pathname === '/api/admin/withdrawal/process' && req.method === 'POST') {
      const { withdrawalId, action } = body;
      const withdrawals = readDB('withdrawals.json');
      const wIdx = withdrawals.findIndex(w => w.id === withdrawalId);
      if (wIdx === -1) return sendJSON(res, 404, { error: 'Withdrawal not found' });

      const withdrawal = withdrawals[wIdx];
      if (withdrawal.status !== 'pending') {
        return sendJSON(res, 400, { error: 'Withdrawal already processed' });
      }

      if (action === 'reject') {
        const users = readUsers();
        const uIdx = users.findIndex(u => u.id === withdrawal.userId);
        if (uIdx !== -1) {
          users[uIdx].balance = Math.round((users[uIdx].balance + withdrawal.amount) * 100) / 100;
          writeUsers(users);
        }
        withdrawals[wIdx].status = 'rejected';
      } else if (action === 'approve') {
        withdrawals[wIdx].status = 'approved';
      } else {
        return sendJSON(res, 400, { error: 'Invalid action' });
      }

      withdrawals[wIdx].processedAt = new Date().toISOString();
      writeDB('withdrawals.json', withdrawals);
      logActivity(withdrawal.userId, 'withdraw', `Withdrawal ${action}d`, { withdrawalId });
      return sendJSON(res, 200, { success: true, withdrawal: withdrawals[wIdx] });
    }

    if (pathname === '/api/admin/user/ban' && req.method === 'POST') {
      const { userId, banned } = body;
      const users = readUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) return sendJSON(res, 404, { error: 'User not found' });
      users[idx].banned = !!banned;
      writeUsers(users);
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/user/delete' && req.method === 'POST') {
      const { userId } = body;
      let users = readUsers();
      users = users.filter(u => u.id !== userId);
      writeUsers(users);
      return sendJSON(res, 200, { success: true });
    }

    if (pathname === '/api/admin/user/reset' && req.method === 'POST') {
      const { userId } = body;
      const users = readUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) return sendJSON(res, 404, { error: 'User not found' });
      users[idx].suspicious = false;
      users[idx].rapidStrikes = 0;
      users[idx].answerTimestamps = [];
      users[idx].lastAnswerAt = 0;
      writeUsers(users);
      return sendJSON(res, 200, { success: true });
    }

    return sendJSON(res, 404, { error: 'Admin endpoint not found' });
  }

  sendJSON(res, 404, { error: 'API endpoint not found' });
}

// ─── Static file server ────────────────────────────────────────────────

function serveStatic(req, res, pathname) {
  // Block direct access to database and scripts
  if (pathname.startsWith('/database') || pathname.startsWith('/scripts')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  filePath = resolved;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsed.pathname;

    if (pathname.startsWith('/api/')) {
      return await handleAPI(req, res, pathname);
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      sendJSON(res, 500, { error: 'Internal server error' });
    }
  }
});

// Startup maintenance
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
['users.json', 'withdrawals.json', 'referrals.json', 'questions.json', 'activitylogs.json', 'sessions.json'].forEach(f => {
  if (!fs.existsSync(dbPath(f))) writeDB(f, []);
});
pruneSessions();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Run: npm run stop\n       Then: npm start\n`);
    process.exit(1);
  }
  console.error('Server failed to start:', err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  MathEarning server running at http://localhost:${PORT}\n`);
  console.log(`  Admin login: username "admin", password "admin123"\n`);
  console.log(`  Stop server: npm run stop\n`);
});
