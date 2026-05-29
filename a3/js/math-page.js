/**
 * MathEarning - Math solving page
 */

document.addEventListener('DOMContentLoaded', async () => {
  await initUserPage('math', () => {
    MathEngine.init();
  });
});
