/**
 * MathEarning - Shared utilities
 */

const Utils = {
  formatMoney(amount) {
    return `₱${Number(amount || 0).toFixed(2)}`;
  },

  formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  },

  getDeviceFingerprint() {
    const KEY = 'mathearning_device_fp';
    let fp = localStorage.getItem(KEY);
    if (!fp) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('MathEarning', 2, 2);
      const data = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        canvas.toDataURL()
      ].join('|');
      fp = btoa(data).slice(0, 64);
      localStorage.setItem(KEY, fp);
    }
    return fp;
  },

  getReferralFromURL() {
    return new URLSearchParams(window.location.search).get('ref') || '';
  },

  getReferralLink(username) {
    return `${window.location.origin}/register.html?ref=${encodeURIComponent(username)}`;
  },

  toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  },

  showLoading(show = true) {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loader"></div>';
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active', show);
  },

  initTheme() {
    const saved = localStorage.getItem('mathearning_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = saved === 'dark' ? '☀️' : '🌙';
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('mathearning_theme', next);
        btn.textContent = next === 'dark' ? '☀️' : '🌙';
      });
    });
  },

  initSidebar() {
    const toggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!toggle || !sidebar) return;
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay?.classList.toggle('active');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  },

  /** Require logged-in regular user — never redirects to admin */
  async requireUser() {
    Api.useRole('user');
    if (!Api.getUserToken()) {
      window.location.href = 'login.html';
      return null;
    }
    try {
      const data = await Api.getMe();
      if (data.isAdmin) {
        Api.clearUserToken();
        window.location.href = 'login.html';
        return null;
      }
      if (!data.user) {
        Api.clearUserToken();
        window.location.href = 'login.html';
        return null;
      }
      return data.user;
    } catch {
      Api.clearUserToken();
      window.location.href = 'login.html';
      return null;
    }
  },

  /** Require logged-in admin — never redirects to user dashboard */
  async requireAdmin() {
    Api.useRole('admin');
    if (!Api.getAdminToken()) {
      window.location.href = 'admin-login.html';
      return null;
    }
    try {
      const data = await Api.getMe();
      if (!data.isAdmin) {
        Api.clearAdminToken();
        window.location.href = 'admin-login.html';
        return null;
      }
      return data;
    } catch {
      Api.clearAdminToken();
      window.location.href = 'admin-login.html';
      return null;
    }
  },

  async redirectUserIfLoggedIn() {
    Api.useRole('user');
    if (!Api.getUserToken()) return;
    try {
      const data = await Api.getMe();
      if (!data.isAdmin && data.user) {
        window.location.href = 'dashboard.html';
      }
    } catch {
      Api.clearUserToken();
    }
  },

  async redirectAdminIfLoggedIn() {
    Api.useRole('admin');
    if (!Api.getAdminToken()) return;
    try {
      const data = await Api.getMe();
      if (data.isAdmin) {
        window.location.href = 'admin.html';
      }
    } catch {
      Api.clearAdminToken();
    }
  },

  playCorrectSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch { /* ignore */ }
  },

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      Utils.toast('Copied to clipboard!', 'success');
    }).catch(() => Utils.toast('Could not copy', 'error'));
  }
};
