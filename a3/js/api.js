/**
 * MathEarning - API client with separate user/admin sessions
 */

const API_BASE = '';
const USER_TOKEN_KEY = 'mathearning_user_token';
const ADMIN_TOKEN_KEY = 'mathearning_admin_token';

const Api = {
  role: null, // 'user' | 'admin' | null

  useRole(role) {
    this.role = role;
  },

  getUserToken() {
    return localStorage.getItem(USER_TOKEN_KEY);
  },

  getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  getToken() {
    if (this.role === 'admin') return this.getAdminToken();
    if (this.role === 'user') return this.getUserToken();
    return this.getUserToken() || this.getAdminToken();
  },

  setUserToken(token) {
    if (token) {
      localStorage.setItem(USER_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(USER_TOKEN_KEY);
    }
  },

  setAdminToken(token) {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  },

  clearUserToken() {
    this.setUserToken(null);
  },

  clearAdminToken() {
    this.setAdminToken(null);
  },

  clearAllTokens() {
    this.clearUserToken();
    this.clearAdminToken();
    document.cookie = 'mathearning_token=; path=/; max-age=0';
  },

  /** @deprecated use setUserToken or setAdminToken */
  setToken(token) {
    if (this.role === 'admin') this.setAdminToken(token);
    else this.setUserToken(token);
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (!options.noAuth) {
      const token = this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch {
      throw new Error('Cannot reach server. Run "npm start" in the project folder.');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        if (this.role === 'admin') this.clearAdminToken();
        else if (this.role === 'user') this.clearUserToken();
        else {
          this.clearUserToken();
          this.clearAdminToken();
        }
      }
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
  },

  register(payload) {
    return this.request('/api/register', { method: 'POST', body: payload, noAuth: true });
  },

  loginUser(username, password) {
    return this.request('/api/login', { method: 'POST', body: { username, password, loginType: 'user' }, noAuth: true });
  },

  loginAdmin(username, password) {
    return this.request('/api/login', { method: 'POST', body: { username, password, loginType: 'admin' }, noAuth: true });
  },

  logout() {
    return this.request('/api/logout', { method: 'POST' });
  },

  getMe() {
    return this.request('/api/me');
  },

  updateSettings(data) {
    return this.request('/api/settings', { method: 'PUT', body: data });
  },

  getQuestion() {
    return this.request('/api/question', { method: 'POST' });
  },

  submitAnswer(questionId, answer) {
    return this.request('/api/answer', {
      method: 'POST',
      body: { questionId, answer, clientTimestamp: Date.now() }
    });
  },

  trackReferralClick(referrerUsername, deviceFingerprint) {
    return this.request('/api/referral/click', {
      method: 'POST',
      body: { referrerUsername, deviceFingerprint },
      noAuth: true
    });
  },

  requestWithdrawal(data) {
    return this.request('/api/withdraw', { method: 'POST', body: data });
  },

  getWithdrawals() {
    return this.request('/api/withdrawals');
  },

  getActivity() {
    return this.request('/api/activity');
  },

  getLeaderboard() {
    return this.request('/api/leaderboard');
  },

  getDailyStats() {
    return this.request('/api/stats/daily');
  },

  adminGetUsers() {
    return this.request('/api/admin/users');
  },

  adminGetWithdrawals() {
    return this.request('/api/admin/withdrawals');
  },

  adminGetReferrals() {
    return this.request('/api/admin/referrals');
  },

  adminGetStats() {
    return this.request('/api/admin/stats');
  },

  adminProcessWithdrawal(withdrawalId, action) {
    return this.request('/api/admin/withdrawal/process', {
      method: 'POST',
      body: { withdrawalId, action }
    });
  },

  adminBanUser(userId, banned) {
    return this.request('/api/admin/user/ban', { method: 'POST', body: { userId, banned } });
  },

  adminDeleteUser(userId) {
    return this.request('/api/admin/user/delete', { method: 'POST', body: { userId } });
  },

  adminResetUser(userId) {
    return this.request('/api/admin/user/reset', { method: 'POST', body: { userId } });
  }
};
