/**
 * MathEarning - Referrals page
 */

document.addEventListener('DOMContentLoaded', async () => {
  await initUserPage('referrals', (user) => {
    document.getElementById('referral-link').value = Utils.getReferralLink(user.username);
    document.getElementById('stat-referral-earnings').textContent = Utils.formatMoney(user.referralEarnings);
    document.getElementById('stat-referral-count').textContent = user.referralCount || 0;

    document.getElementById('copy-referral')?.addEventListener('click', () => {
      Utils.copyToClipboard(document.getElementById('referral-link').value);
    });
  });
});
