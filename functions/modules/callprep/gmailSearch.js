'use strict';

const { getAccessToken } = require('../googleAuth');

async function searchGmailThreads(authClient, query, maxResults = 5) {
  const token = await getAccessToken(authClient);

  const params = new URLSearchParams({
    q: `"${query}"`,
    maxResults: maxResults.toString(),
  });

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) throw new Error(`Gmail threads API ${listRes.status}: ${await listRes.text()}`);

  const listData = await listRes.json();
  const threads = listData.threads || [];

  const details = await Promise.all(
    threads.map(async ({ id }) => {
      try {
        const threadRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!threadRes.ok) return null;

        const thread = await threadRes.json();
        const messages = thread.messages || [];
        if (!messages.length) return null;

        const firstMsg = messages[0];
        const lastMsg = messages[messages.length - 1];

        const getHeader = (msg, name) =>
          (msg.payload?.headers || []).find((h) => h.name === name)?.value || null;

        return {
          subject: getHeader(firstMsg, 'Subject') || '(No subject)',
          from: getHeader(firstMsg, 'From') || null,
          date: getHeader(lastMsg, 'Date') || null,
          messageCount: messages.length,
          snippet: lastMsg.snippet || null,
        };
      } catch {
        return null;
      }
    })
  );

  return details.filter(Boolean);
}

module.exports = { searchGmailThreads };
