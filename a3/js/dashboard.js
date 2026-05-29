/**
 * MathEarning - Dashboard (overview only)
 */

const Dashboard = {
  user: null,

  async init() {
    this.user = await initUserPage('dashboard', (user) => {
      this.user = user;
      this.renderUser();
      this.loadActivity();
      this.loadDailyStats();
    });
  },

  renderUser() {
    const u = this.user;
    document.getElementById('user-greeting').textContent = `Hello, ${u.fullName}`;
    document.getElementById('stat-balance').textContent = Utils.formatMoney(u.balance);
    document.getElementById('stat-earnings').textContent = Utils.formatMoney(u.totalEarnings);
    document.getElementById('stat-questions').textContent = u.questionsAnswered || 0;
    document.getElementById('stat-referral-earnings').textContent = Utils.formatMoney(u.referralEarnings);
    document.getElementById('stat-referral-count').textContent = u.referralCount || 0;
  },

  async loadActivity() {
    try {
      const { activity } = await Api.getActivity();
      const list = document.getElementById('activity-list');
      if (!list) return;
      list.innerHTML = activity.length
        ? activity.map(a => `
          <li style="padding:0.5rem 0;border-bottom:1px solid var(--border)">
            <small style="color:var(--text-secondary)">${Utils.formatDate(a.timestamp)}</small><br>
            ${a.message}
          </li>`).join('')
        : '<li>No recent activity</li>';
    } catch { /* optional */ }
  },

  async loadDailyStats() {
    try {
      const { stats } = await Api.getDailyStats();
      const chart = document.getElementById('daily-chart');
      if (!chart) return;
      const max = Math.max(...stats.map(s => s.earnings), 0.02);
      chart.innerHTML = stats.map(s => `
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="height:${Math.max((s.earnings / max) * 100, 4)}px" title="${Utils.formatMoney(s.earnings)}"></div>
          <span>${s.date.slice(5)}</span>
        </div>`).join('');
    } catch { /* optional */ }
  }
};

document.addEventListener('DOMContentLoaded', () => Dashboard.init());
