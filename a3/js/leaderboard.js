/**
 * MathEarning - Leaderboard page
 */

document.addEventListener('DOMContentLoaded', async () => {
  await initUserPage('leaderboard', async () => {
    try {
      const { leaderboard } = await Api.getLeaderboard();
      const list = document.getElementById('leaderboard-list');
      list.innerHTML = leaderboard.length
        ? leaderboard.map(item => {
          const rankClass = item.rank === 1 ? 'gold' : item.rank === 2 ? 'silver' : item.rank === 3 ? 'bronze' : '';
          return `
            <div class="leaderboard-item">
              <span class="rank ${rankClass}">${item.rank}</span>
              <div style="flex:1">
                <strong>${item.username}</strong>
                <div style="font-size:0.85rem;color:var(--text-secondary)">${item.questionsAnswered} questions</div>
              </div>
              <span style="color:var(--success);font-weight:600">${Utils.formatMoney(item.totalEarnings)}</span>
            </div>`;
        }).join('')
        : '<p>No data yet</p>';
    } catch (err) {
      Utils.toast(err.message, 'error');
    }
  });
});
