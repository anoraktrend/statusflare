# StatusFlare 🛰️

StatusFlare is a lightweight, edge-hosted system health monitoring dashboard built on **Cloudflare Workers** and **D1 Database**. It provides real-time monitoring, incident management, and dynamic status badges with zero infrastructure overhead. 

This is useful for the following usecases:

- You want a FOSS solution for a system health deashboard, but you don't want to host it yourself.
- You want to be sure of your service's public availability, but you don't want to pay companies that you don't trust.
- You want a system health dashboard with discord webhook capabilities, a smooth default theme, and highly customizable
interface that integrates with your current stack
- all of the above.

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
- **Email Notifications**: Integrated with Mailgun to send alerts when services go down or incidents are created/resolved.

## 🚀 Quick Start

### Forking / Redistribution

This repo contains personal configuration (domains, emails, an admin password hash). Before publishing a fork, remove it:

```bash
pnpm clean:repo   # replaces personal values with placeholders, deletes personal-only files
```

The only personal values remaining afterward are inside `scripts/cleanup.mjs` itself (its replacement table).

### Fresh Deployment

New operators configure everything interactively (domain, notification email, admin auth — password or Authelia — plus optional Mailgun/Discord secrets, D1 creation, and local setup):

```bash
pnpm setup
```

An admin password or Authelia client ID + secret is required; all other inputs are optional.

### Prerequisites

- [Cloudflare Account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-setup/) installed and authenticated.
- Node.js and pnpm.

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/statusflare.git
   cd statusflare
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Create your D1 Database:**
   ```bash
   pnpm exec wrangler d1 create status_db
   ```
   Copy the `database_id` from the output and update it in your `wrangler.jsonc`.

4. **Initialize the database schema:**
   ```bash
   pnpm exec wrangler d1 execute status_db --file=schema.sql
   ```

5. **Set required secrets:**
   ```bash
   # Used for JWT session signing
   pnpm exec wrangler secret put SESSION_SECRET
   
   # Optional: For legacy password login (SHA-256 hash)
   pnpm exec wrangler secret put ADMIN_PASSWORD_HASH

   # Email Alerts (Mailgun)
   pnpm exec wrangler secret put MAILGUN_API_KEY
   ```

6. **Configure Mailgun Variables:**
   Update your `wrangler.jsonc` with your Mailgun domain and recipient email:
   ```jsonc
   {
     "vars": {
       "MAILGUN_DOMAIN": "mg.yourdomain.com",
       "MAILGUN_FROM": "StatusFlare <alerts@mg.yourdomain.com>",
       "NOTIFICATION_EMAIL": "admin@example.com"
     }
   }
   ```

7. **Deploy to Cloudflare:**
   ```bash
   pnpm deploy
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
pnpm dev
```

Run the test suite (Vitest + Cloudflare Workers Pool):
```bash
pnpm test
```

## 📄 License

MIT
