// Email (Postmark) and push (Expo) with a console fallback so jobs run without credentials.
export async function sendEmail({ to, subject, text, html }) {
  if (!process.env.POSTMARK_TOKEN) {
    console.log(`[email → ${to}] ${subject}\n${text}`);
    return { simulated: true };
  }
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN },
    body: JSON.stringify({ From: process.env.EMAIL_FROM || 'verify@rightseat.example', To: to, Subject: subject, TextBody: text, HtmlBody: html }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sendPush({ token, title, body, data }) {
  if (!token) return { skipped: true };
  if (process.env.PUSH_DISABLED) {
    console.log(`[push] ${title}: ${body}`);
    return { simulated: true };
  }
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, data }),
  });
  return res.json();
}

export async function notifyUser(user, { title, body, email = true }) {
  const out = [];
  if (user?.pushToken) out.push(await sendPush({ token: user.pushToken, title, body }));
  if (email && user?.email) out.push(await sendEmail({ to: user.email, subject: title, text: body }));
  return out;
}
