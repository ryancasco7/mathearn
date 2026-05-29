/**
 * MathEarning - Account settings
 */

document.addEventListener('DOMContentLoaded', async () => {
  await initUserPage('settings', (user) => {
    document.getElementById('settings-fullName').value = user.fullName;
    document.getElementById('settings-email').value = user.email;
    document.getElementById('settings-username').value = user.username;

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      Utils.showLoading(true);
      try {
        const newPassword = document.getElementById('settings-new-password').value;
        const payload = {
          fullName: document.getElementById('settings-fullName').value.trim(),
          email: document.getElementById('settings-email').value.trim()
        };
        if (newPassword) {
          const current = document.getElementById('settings-current-password').value;
          if (!current) {
            Utils.toast('Enter current password to set a new one', 'error');
            return;
          }
          payload.currentPassword = current;
          payload.newPassword = newPassword;
        }
        await Api.updateSettings(payload);
        Utils.toast('Settings saved!', 'success');
        document.getElementById('settings-current-password').value = '';
        document.getElementById('settings-new-password').value = '';
      } catch (err) {
        Utils.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        Utils.showLoading(false);
      }
    });
  });
});
