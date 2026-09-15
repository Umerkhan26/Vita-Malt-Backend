import { sendWinnerEmail } from './emailService';

export type NotifyChannel = 'email' | 'sms';

interface NotifyPayload {
  channel: NotifyChannel;
  to: string;
  name: string;
  template: 'winner_grand' | 'winner_secondary' | 'winner_instant';
  prizeLabel: string;
}

const sendSms = async (to: string, body: string): Promise<void> => {
  if (process.env.SMS_ENABLED !== 'true') {
    console.log(`[SMS disabled] to=${to} body=${body}`);
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.warn('SMS enabled but Twilio env vars missing');
    return;
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio SMS failed: ${response.status} ${text}`);
  }
};

export const notifyWinner = async (payload: {
  email?: string;
  phone?: string;
  name: string;
  tier: 'grand' | 'secondary' | 'instant';
  prizeLabel: string;
}): Promise<void> => {
  const template = payload.tier === 'grand' ? 'winner_grand' : payload.tier === 'secondary' ? 'winner_secondary' : 'winner_instant';

  if (payload.email) {
    await sendWinnerEmail(payload.email, payload.name, payload.tier, payload.prizeLabel);
  }

  if (payload.phone) {
    await sendSms(
      payload.phone,
      `Vita Malt: Congratulations ${payload.name}! You are a ${payload.tier} winner (${payload.prizeLabel}). SVBL will contact you to verify and arrange fulfillment.`
    );
  }

  void template;
};

export const sendNotification = async (payload: NotifyPayload): Promise<void> => {
  if (payload.channel === 'email') {
    const tier = payload.template.replace('winner_', '') as 'grand' | 'secondary' | 'instant';
    await sendWinnerEmail(payload.to, payload.name, tier, payload.prizeLabel);
    return;
  }
  await sendSms(
    payload.to,
    `Vita Malt: Hi ${payload.name}, you are a winner (${payload.prizeLabel}). SVBL will contact you shortly.`
  );
};
