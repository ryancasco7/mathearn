# MathEarning

A web-based earning application where users solve random math questions, earn money, refer friends, and request withdrawals.

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript (no frameworks)
- **Backend:** Node.js built-in modules only (`http`, `fs`, `crypto`) — no Express or frameworks
- **Storage:** File-based JSON database in `database/`

## Quick Start

1. Make sure [Node.js](https://nodejs.org/) is installed.
2. Open a terminal in this folder.
3. Run:

```bash
npm start
```

If port 3000 is busy, run `npm run stop` first, then `npm start` again.

4. Open **http://localhost:3000** in your browser.

## Default Admin Login

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

Admin panel: **http://localhost:3000/admin-login.html** (not the regular login page)

## Project Structure

```
├── index.html          # Landing page
├── login.html          # User login
├── admin-login.html    # Admin login (separate)
├── register.html
├── dashboard.html      # Stats overview
├── math.html           # Solve math questions
├── withdraw.html       # Withdrawals
├── referrals.html      # Referral link
├── leaderboard.html    # Top earners
├── settings.html       # Account settings
├── admin.html          # Admin panel
├── server.js           # JSON file API server
├── css/main.css
├── js/
│   ├── api.js          # API client
│   ├── auth.js         # Login/register
│   ├── dashboard.js
│   ├── math.js         # Question UI
│   ├── admin.js
│   ├── settings.js
│   └── utils.js        # Toasts, theme, fingerprint
└── database/
    ├── users.json
    ├── withdrawals.json
    ├── referrals.json
    ├── questions.json
    ├── activitylogs.json
    └── sessions.json
```

## Features

- User registration & login with password hashing (PBKDF2)
- Random unique math questions (4–7 digits, + − × ÷)
- ₱0.02 per correct answer (server-validated)
- Anti-cheat: rapid answer detection, no duplicate rewards
- Referral system: ₱5 per unique device click
- Withdrawals via GCash (min ₱100)
- Leaderboard & daily earnings chart
- Dark/light theme, toasts, sound effects
- Admin: users, withdrawals, referrals, ban/delete/reset

## Referral Link Format

```
http://localhost:3000/register.html?ref=USERNAME
```

## Security Notes

- Answers are validated **only on the server** — client cannot award rewards via console
- Questions are tracked in `questions.json` to prevent duplicates and double rewards
- Sessions stored in `sessions.json` with Bearer token auth
- Change admin password in `server.js` for production use
