/**
 * MathEarning - Admin panel
 */

const Admin = {
  async init() {
    Utils.initTheme();
    if (localStorage.getItem('mathearning_token')) {
      localStorage.removeItem('mathearning_token');
    }

    const session = await Utils.requireAdmin();
    if (!session) return;

    await this.loadAll();
    this.setupTabs();
    document.getElementById('admin-logout')?.addEventListener('click', async () => {
      Api.useRole('admin');
      await Api.logout().catch(() => {});
      Api.clearAdminToken();
      window.location.href = 'admin-login.html';
    });
  },

  async loadAll() {
    Api.useRole('admin');
    Utils.showLoading(true);
    try {
      const [stats, users, withdrawals, referrals] = await Promise.all([
        Api.adminGetStats(),
        Api.adminGetUsers(),
        Api.adminGetWithdrawals(),
        Api.adminGetReferrals()
      ]);
      document.getElementById('admin-total-users').textContent = stats.totalUsers;
      document.getElementById('admin-total-earnings').textContent = Utils.formatMoney(stats.totalEarnings);
      document.getElementById('admin-total-balance').textContent = Utils.formatMoney(stats.totalBalance);
      document.getElementById('admin-pending-withdrawals').textContent = stats.pendingWithdrawals;
      document.getElementById('admin-total-referrals').textContent = stats.totalReferrals;
      this.renderUsers(users.users);
      this.renderWithdrawals(withdrawals.withdrawals);
      this.renderReferrals(referrals.referrals);
    } catch (err) {
      Utils.toast(err.message, 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  renderUsers(users) {
    document.querySelector('#admin-users-table tbody').innerHTML = users.map(u => `
      <tr>
        <td>${u.fullName}</td><td>${u.username}</td><td>${u.email}</td>
        <td>${Utils.formatMoney(u.balance)}</td><td>${Utils.formatMoney(u.totalEarnings)}</td>
        <td>${u.questionsAnswered || 0}</td><td>${u.referralCount || 0}</td>
        <td>${u.banned ? '<span class="status-badge status-rejected">Banned</span>' : u.suspicious ? '<span class="status-badge status-pending">Suspicious</span>' : 'Active'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="Admin.toggleBan('${u.id}', ${!u.banned})">${u.banned ? 'Unban' : 'Ban'}</button>
          <button class="btn btn-sm btn-secondary" onclick="Admin.resetUser('${u.id}')">Reset</button>
          <button class="btn btn-sm btn-danger" onclick="Admin.deleteUser('${u.id}')">Delete</button>
        </td>
      </tr>`).join('');
  },

  renderWithdrawals(withdrawals) {
    const sorted = [...withdrawals].reverse();
    document.querySelector('#admin-withdrawals-table tbody').innerHTML = sorted.map(w => `
      <tr>
        <td>${w.username}</td><td>${w.fullName}</td><td>${w.gcashNumber}</td>
        <td>${Utils.formatMoney(w.amount)}</td>
        <td><span class="status-badge status-${w.status}">${w.status}</span></td>
        <td>${Utils.formatDate(w.requestedAt)}</td>
        <td>${w.status === 'pending' ? `
          <button class="btn btn-sm btn-success" onclick="Admin.processWithdrawal('${w.id}', 'approve')">Approve</button>
          <button class="btn btn-sm btn-danger" onclick="Admin.processWithdrawal('${w.id}', 'reject')">Reject</button>` : '—'}</td>
      </tr>`).join('');
  },

  renderReferrals(referrals) {
    const sorted = [...referrals].reverse().slice(0, 100);
    document.querySelector('#admin-referrals-table tbody').innerHTML = sorted.length
      ? sorted.map(r => `
        <tr>
          <td>${r.referrerUsername}</td>
          <td>${(r.deviceFingerprint || '').slice(0, 16)}...</td>
          <td>${Utils.formatMoney(r.reward)}</td>
          <td>${Utils.formatDate(r.clickedAt)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4">No referrals yet</td></tr>';
  },

  setupTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
      });
    });
  },

  async processWithdrawal(id, action) {
    if (!confirm(`${action} this withdrawal?`)) return;
    Api.useRole('admin');
    try {
      await Api.adminProcessWithdrawal(id, action);
      Utils.toast(`Withdrawal ${action}d`, 'success');
      await this.loadAll();
    } catch (err) { Utils.toast(err.message, 'error'); }
  },

  async toggleBan(userId, banned) {
    Api.useRole('admin');
    try {
      await Api.adminBanUser(userId, banned);
      Utils.toast(banned ? 'User banned' : 'User unbanned', 'success');
      await this.loadAll();
    } catch (err) { Utils.toast(err.message, 'error'); }
  },

  async deleteUser(userId) {
    if (!confirm('Delete this user permanently?')) return;
    Api.useRole('admin');
    try {
      await Api.adminDeleteUser(userId);
      Utils.toast('User deleted', 'success');
      await this.loadAll();
    } catch (err) { Utils.toast(err.message, 'error'); }
  },

  async resetUser(userId) {
    Api.useRole('admin');
    try {
      await Api.adminResetUser(userId);
      Utils.toast('Account reset', 'success');
      await this.loadAll();
    } catch (err) { Utils.toast(err.message, 'error'); }
  }
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
