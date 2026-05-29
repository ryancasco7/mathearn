/**
 * Free port 3000 (or PORT env) before starting server — prevents EADDRINUSE
 */
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      out.split('\n').forEach(line => {
        if (!line.includes('LISTENING')) return;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      });
      pids.forEach(pid => {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`Freed port ${port} (stopped PID ${pid})`);
        } catch { /* ignore */ }
      });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { shell: true, stdio: 'ignore' });
    }
  } catch {
    /* Port already free */
  }
}

freePort(PORT);
