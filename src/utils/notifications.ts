import { Env, StatusChange } from '../types';

export async function sendDiscordNotification(env: Env, title: string, description: string, color: number = 0x5865F2) {
  if (!env.DISCORD_WEBHOOK_URL) return;

  const body = {
    embeds: [{
      title,
      description,
      color,
      timestamp: new Date().toISOString(),
      footer: { text: "StatusFlare Monitoring" }
    }]
  };

  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e: any) {
    console.error(`[Discord] Webhook error: ${e.message}`);
  }
}

export async function sendEmail(env: Env, subject: string, text: string, html?: string) {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.NOTIFICATION_EMAIL) {
    console.warn('[Email] Skipping email send: Mailgun configuration missing');
    return;
  }

  const from = env.MAILGUN_FROM || `StatusFlare <alerts@${env.MAILGUN_DOMAIN}>`;
  const formData = new URLSearchParams();
  formData.append('from', from);
  formData.append('to', env.NOTIFICATION_EMAIL);
  formData.append('subject', subject);
  formData.append('text', text);
  if (html) {
    formData.append('html', html);
  }

  try {
    const res = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`api:${env.MAILGUN_API_KEY}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Email] Mailgun error ${res.status}: ${errText}`);
    }
  } catch (e: any) {
    console.error(`[Email] Fetch error: ${e.message}`);
  }
}

export async function notifyStatusChanges(env: Env, changes: StatusChange[]) {
  if (changes.length === 0) return;

  const isMultiple = changes.length > 1;
  const firstChange = changes[0];
  
  let subject = '';
  if (isMultiple) {
    const downCount = changes.filter(c => c.status === 'down').length;
    const upCount = changes.filter(c => c.status === 'up').length;
    subject = `[StatusFlare] Multiple Services Status Change (${downCount} DOWN, ${upCount} UP)`;
  } else {
    subject = `[StatusFlare] ${firstChange.serviceName} is ${firstChange.status.toUpperCase()}`;
  }

  // --- Discord Notification ---
  if (env.DISCORD_WEBHOOK_URL) {
    let discordDescription = '';
    changes.forEach(c => {
      const emoji = c.status === 'up' ? '✅' : '🚨';
      discordDescription += `${emoji} **${c.serviceName}**: ${c.previousStatus.toUpperCase()} → **${c.status.toUpperCase()}**\n`;
    });
    
    const overallColor = changes.some(c => c.status === 'down') ? 0xED4245 : 0x57F287;
    await sendDiscordNotification(env, subject, discordDescription, overallColor);
  }

  // --- Email Notification ---
  if (env.MAILGUN_API_KEY) {
    // Get all users who have notifications enabled
    const { results: users } = await env.status_db.prepare('SELECT email FROM users WHERE notifications_enabled = 1').all<{email: string}>();
    const recipientEmails = new Set(users.map(u => u.email));
    
    // Always include the default notification email if configured
    if (env.NOTIFICATION_EMAIL) {
      recipientEmails.add(env.NOTIFICATION_EMAIL);
    }

    if (recipientEmails.size === 0) return;

    const toList = Array.from(recipientEmails).join(',');

    const text = changes.map(c => 
      `Service: ${c.serviceName}\nStatus: ${c.status.toUpperCase()}\nPrevious: ${c.previousStatus.toUpperCase()}\nCode: ${c.statusCode}\nTime: ${c.time}\nDetails: ${c.responseSnippet}\n`
    ).join('\n---\n\n');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
          .service-card { border: 1px solid #eee; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
          .status-up { color: #007c00; font-weight: bold; }
          .status-down { color: #f80008; font-weight: bold; }
          .label { font-weight: bold; color: #666; font-size: 0.9em; }
          .footer { margin-top: 30px; font-size: 0.8em; color: #888; text-align: center; }
          .button { display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
          pre { background: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>StatusFlare Alert</h2>
          <p>${isMultiple ? 'Multiple services have changed status.' : `The status of <strong>${firstChange.serviceName}</strong> has changed.`}</p>
        </div>
        ${changes.map(c => `
          <div class="service-card">
            <h3 style="margin-top: 0;">${c.serviceName}</h3>
            <p>Status: <span class="status-${c.status}">${c.status.toUpperCase()}</span> (was ${c.previousStatus.toUpperCase()})</p>
            <p><span class="label">Time:</span> ${new Date(c.time).toLocaleString()}</p>
            ${c.statusCode ? `<p><span class="label">HTTP Code:</span> ${c.statusCode}</p>` : ''}
            ${c.responseSnippet ? `<p><span class="label">Details:</span></p><pre>${c.responseSnippet.replace(/</g, '&lt;')}</pre>` : ''}
          </div>
        `).join('')}
        <div style="text-align: center;">
          <a href="${env.MAILGUN_DOMAIN ? `https://${env.MAILGUN_DOMAIN.split('.').slice(-2).join('.')}` : '#'}" class="button">View Dashboard</a>
        </div>
        <div class="footer">
          Sent by StatusFlare Monitoring System
        </div>
      </body>
      </html>
    `;

    await sendEmailTo(env, toList, subject, text, html);
  }
}

async function sendEmailTo(env: Env, to: string, subject: string, text: string, html?: string) {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) {
    console.warn('[Email] Skipping email send: Mailgun configuration missing');
    return;
  }

  const from = env.MAILGUN_FROM || `StatusFlare <alerts@${env.MAILGUN_DOMAIN}>`;
  const formData = new URLSearchParams();
  formData.append('from', from);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('text', text);
  if (html) {
    formData.append('html', html);
  }

  try {
    const res = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`api:${env.MAILGUN_API_KEY}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Email] Mailgun error ${res.status}: ${errText}`);
    }
  } catch (e: any) {
    console.error(`[Email] Fetch error: ${e.message}`);
  }
}
