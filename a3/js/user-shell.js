/**
 * MathEarning - Init shared user page shell
 */
async function initUserPage(activePage, onReady) {
  Utils.initTheme();
  Utils.initSidebar();
  Nav.render(activePage);
  Nav.setupLogout();

  // Remove legacy single-token storage (caused admin/user mix-ups)
  if (localStorage.getItem('mathearning_token')) {
    localStorage.removeItem('mathearning_token');
  }

  const user = await Utils.requireUser();
  if (!user) return;
  if (typeof onReady === 'function') onReady(user);
  return user;
}
