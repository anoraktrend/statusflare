# StatusFlare 🛰️

StatusFlare is a lightweight, self-hosted system health monitoring dashboard built on **Cloudflare Workers** and **D1 Database**. It provides real-time monitoring, incident management, and dynamic status badges with zero infrastructure overhead.

![Status Dashboard](public/status.svg)

## ✨ Features

- **Edge-native**: Powered by Cloudflare Workers for global availability and high performance.
- **Automated Health Checks**: Scheduled monitoring via Cron triggers (default: every minute).
- **Real-time Dashboard**: A beautiful, responsive HTML dashboard with Light/Dark mode (Catppuccin theme).
- **Incident Management**: Create, manage, and resolve system-wide or service-specific incidents.
- **Detailed Insights**: View average latency, recent uptime percentages, and full response snippets.
- **Dynamic SVG Badges**: Embeddable status dots for your READMEs or websites (e.g., `/badge/My%20Service.svg`).
- **D1 Persistence**: All data—services, health history, and incidents—is stored in Cloudflare's D1 SQL database.
- **Admin Panel**: Secure management interface with support for OIDC (Authelia) and legacy password login.
- **Smart Parsing**: Automatically prettifies JSON and GraphQL responses in the service detail view.

## 🚀 Quick Start

### Prerequisites

- [Cloudflare Account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-setup/) installed and authenticated.
- Node.js and npm (or pnpm).

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/statusflare.git
   cd statusflare
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create your D1 Database:**
   ```bash
   npx wrangler d1 create status_db
   ```
   Copy the `database_id` from the output and update it in your `wrangler.jsonc`.

4. **Initialize the database schema:**
   ```bash
   npx wrangler d1 execute status_db --file=schema.sql
   ```

5. **Set required secrets:**
   ```bash
   # Used for JWT session signing
   npx wrangler secret put SESSION_SECRET
   
   # Optional: For legacy password login (SHA-256 hash)
   npx wrangler secret put ADMIN_PASSWORD_HASH
   ```

6. **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

## 🛠️ Configuration

Edit `wrangler.jsonc` to configure your custom domain, OIDC provider (e.g., Authelia), and other environment variables:

```jsonc
{
  "vars": {
    "AUTHELIA_ISSUER": "https://auth.example.com",
    "AUTHELIA_CLIENT_ID": "statusflare",
    "OIDC_REDIRECT_URI": "https://status.example.com/admin/callback"
  }
}
```

## 📈 Usage

- **Dashboard**: `https://your-status-page.com/`
- **Admin Panel**: `https://your-status-page.com/admin`
- **JSON API**: `https://your-status-page.com/api/status`
- **SVG Badges**: `https://your-status-page.com/badge/Service%20Name.svg?w=128&h=128`

## 🧪 Development & Testing

Run local development server:
```bash
npm run dev
```

Run the test suite (Vitest + Cloudflare Workers Pool):
```bash
npm test
```

## 📄 License

MIT
