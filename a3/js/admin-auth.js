/**
 * MathEarning - Admin login only
 */

document.addEventListener('DOMContentLoaded', () => {
  Utils.initTheme();
  Api.useRole(null);
  Utils.redirectAdminIfLoggedIn();

  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    Utils.showLoading(true);

    try {
      Api.clearAllTokens();
      const data = await Api.loginAdmin(username, password);
      if (!data.isAdmin) {
        throw new Error('Not an admin account');
      }
      Api.setAdminToken(data.token);
      Utils.toast('Admin login successful', 'success');
      window.location.href = 'admin.html';
    } catch (err) {
      Utils.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      Utils.showLoading(false);
    }
  });
});
