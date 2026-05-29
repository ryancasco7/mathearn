/**
 * MathEarning - Withdraw page
 */

const WithdrawPage = {
  user: null,

  async init() {
    this.user = await initUserPage('withdraw', (user) => {
      this.user = user;
      document.getElementById('withdraw-name').value = user.fullName;
      this.loadWithdrawals();
      this.setupForm();
    });
  },

  async loadWithdrawals() {
    try {
      const { withdrawals } = await Api.getWithdrawals();
      const pending = withdrawals.find(w => w.status === 'pending');
      const statusEl = document.getElementById('withdrawal-status');
      if (statusEl) {
        statusEl.textContent = pending
          ? `Pending: ${Utils.formatMoney(pending.amount)}`
          : withdrawals.length ? `Last: ${withdrawals[0].status}` : 'No requests';
      }
      const tbody = document.querySelector('#withdrawal-history tbody');
      if (!tbody) return;
      tbody.innerHTML = withdrawals.length
        ? withdrawals.map(w => `
          <tr>
            <td>${Utils.formatDate(w.requestedAt)}</td>
            <td>${Utils.formatMoney(w.amount)}</td>
            <td><span class="status-badge status-${w.status}">${w.status}</span></td>
          </tr>`).join('')
        : '<tr><td colspan="3">No withdrawals yet</td></tr>';
    } catch (err) {
      Utils.toast(err.message, 'error');
    }
  },

  setupForm() {
    document.getElementById('withdraw-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('withdraw-name').value.trim();
      const gcashNumber = document.getElementById('withdraw-gcash').value.trim();
      const amount = parseFloat(document.getElementById('withdraw-amount').value);

      if (amount < 100) {
        Utils.toast('Minimum withdrawal is ₱100', 'error');
        return;
      }

      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      Utils.showLoading(true);
      try {
        const result = await Api.requestWithdrawal({ fullName, gcashNumber, amount });
        Utils.toast('Withdrawal submitted!', 'success');
        this.user.balance = result.balance;
        await this.loadWithdrawals();
        e.target.reset();
        document.getElementById('withdraw-name').value = fullName;
      } catch (err) {
        Utils.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        Utils.showLoading(false);
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => WithdrawPage.init());
