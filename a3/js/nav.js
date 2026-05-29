/**
 * MathEarning - Shared user sidebar navigation
 */

const Nav = {
  pages: [
    { id: 'dashboard', href: 'dashboard.html', icon: '📊', label: 'Dashboard' },
    { id: 'math', href: 'math.html', icon: '🔢', label: 'Solve Math' },
    { id: 'withdraw', href: 'withdraw.html', icon: '💸', label: 'Withdraw' },
    { id: 'referrals', href: 'referrals.html', icon: '👥', label: 'Referrals' },
    { id: 'leaderboard', href: 'leaderboard.html', icon: '🏆', label: 'Leaderboard' },
    { id: 'settings', href: 'settings.html', icon: '⚙️', label: 'Settings' }
  ],

  render(activePage) {
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    sidebar.innerHTML = this.pages.map(p => `
      <li>
        <a href="${p.href}" class="${p.id === activePage ? 'active' : ''}">${p.icon} ${p.label}</a>
      </li>
    `).join('');
  },

  setupLogout() {
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      Api.useRole('user');
      await Api.logout().catch(() => {});
      Api.clearUserToken();
      window.location.href = 'login.html';
    });
  }
};
