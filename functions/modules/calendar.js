'use strict';

const { getAccessToken } = require('./googleAuth');

async function getTodaysEvents(authClient) {
  const token = await getAccessToken(authClient);

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return (data.items || []).map((item) => ({
    title: item.summary || '(No title)',
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
    location: item.location || null,
  }));
}

module.exports = { getTodaysEvents };
