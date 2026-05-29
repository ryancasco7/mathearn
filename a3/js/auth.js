/**
 * MathEarning - User login & register (NOT admin)
 */

document.addEventListener('DOMContentLoaded', () => {
  Utils.initTheme();
  Api.useRole(null);

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    Utils.redirectUserIfLoggedIn();

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      if (username.toLowerCase() === 'admin') {
        Utils.toast('Admin must use the Admin Login page.', 'error');
        return;
      }

      const btn = loginForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      Utils.showLoading(true);

      try {
        Api.clearAllTokens();
        const data = await Api.loginUser(username, password);
        Api.setUserToken(data.token);
        Utils.toast('Welcome back!', 'success');
        window.location.href = 'dashboard.html';
      } catch (err) {
        Utils.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        Utils.showLoading(false);
      }
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    Utils.redirectUserIfLoggedIn();

    const refCode = Utils.getReferralFromURL();
    if (refCode) {
      const refInput = document.getElementById('referral-display');
      if (refInput) refInput.textContent = `Referred by: ${refCode}`;
      trackReferralClick(refCode);
    }

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('fullName').value.trim();
      const username = document.getElementById('username').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirm = document.getElementById('confirmPassword').value;

      if (username.toLowerCase() === 'admin') {
        Utils.toast('Username "admin" is reserved.', 'error');
        return;
      }
      if (password !== confirm) {
        Utils.toast('Passwords do not match', 'error');
        return;
      }

      const btn = registerForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      Utils.showLoading(true);

      try {
        Api.clearAllTokens();
        const data = await Api.register({
          fullName, username, email, password,
          referralCode: refCode || undefined,
          deviceFingerprint: Utils.getDeviceFingerprint()
        });
        Api.setUserToken(data.token);
        Utils.toast('Account created!', 'success');
        window.location.href = 'dashboard.html';
      } catch (err) {
        Utils.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        Utils.showLoading(false);
      }
    });
  }
});

async function trackReferralClick(referrerUsername) {
  const KEY = `mathearning_ref_clicked_${referrerUsername}`;
  if (localStorage.getItem(KEY)) return;
  try {
    await Api.trackReferralClick(referrerUsername, Utils.getDeviceFingerprint());
    localStorage.setItem(KEY, '1');
  } catch { /* ignore */ }
}
