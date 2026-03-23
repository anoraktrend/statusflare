import { Env } from '../types';

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

export async function sendEmail(env: Env, subject: string, text: string) {
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
