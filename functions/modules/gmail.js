'use strict';

const { getAccessToken } = require('./googleAuth');

async function getUrgentEmails(authClient) {
  const token = await getAccessToken(authClient);
  const since = Math.floor((Date.now() - 12 * 60 * 60 * 1000) / 1000);

  const listParams = new URLSearchParams({
    q: `is:unread after:${since}`,
    maxResults: '10',
  });

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    throw new Error(`Gmail list API ${listRes.status}: ${await listRes.text()}`);
  }

  const listData = await listRes.json();
  const messages = listData.messages || [];

  const details = await Promise.all(
    messages.map(async ({ id }) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!msgRes.ok) return null;

        const msg = await msgRes.json();
        const headers = {};
        for (const h of msg.payload?.headers || []) {
          headers[h.name] = h.value;
        }

        return {
          from: headers['From'] || null,
          subject: headers['Subject'] || '(No subject)',
          date: headers['Date'] || null,
          snippet: msg.snippet || null,
        };
      } catch {
        return null;
      }
    })
  );

  return details.filter(Boolean);
}

module.exports = { getUrgentEmails };
