'use strict';

function formatEvents(events) {
  if (!events.length) return 'No meetings scheduled today.';
  return events
    .map((e) => {
      const time = e.start ? new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) : 'All day';
      return `• ${time} — ${e.title}${e.location ? ` @ ${e.location}` : ''}`;
    })
    .join('\n');
}

function formatEmails(emails) {
  if (!emails.length) return 'No unread emails in the last 12 hours.';
  return emails
    .map((e) => `• *${e.subject}* from ${e.from}\n  ${e.snippet || ''}`)
    .join('\n');
}

function formatCandidates(candidates) {
  if (!candidates.length) return 'No stale candidates requiring attention.';
  return candidates
    .map((c) => `• *${c.name}* — ${c.role} @ ${c.company} (${c.status}, ${c.daysStale}d stale)`)
    .join('\n');
}

function formatMarket(news) {
  const sections = [];
  if (news.migrations?.answer) sections.push(`_Migrations:_ ${news.migrations.answer}`);
  if (news.projectWins?.answer) sections.push(`_Project Wins:_ ${news.projectWins.answer}`);
  if (news.execMoves?.answer) sections.push(`_Exec Moves:_ ${news.execMoves.answer}`);
  return sections.length ? sections.join('\n') : 'No market intel available today.';
}

async function synthesizeBriefing(anthropicClient, { events, emails, candidates, news }) {
  const prompt = `You are an executive assistant preparing a morning briefing for an SAP staffing firm leader.

Produce a Slack message with EXACTLY these 5 sections using Slack markdown (*bold* for headers):

*TODAY* — Calendar summary
*URGENT* — Emails needing action
*PIPELINE* — Stale candidates needing follow-up
*MARKET* — SAP industry highlights
*ACTION* — Top 3 recommended actions for today

Rules:
- Keep each section to 3-5 bullet points max
- Use • for bullets
- Be direct and actionable, no filler
- If data is unavailable, write "None" for that section

--- DATA ---

CALENDAR (today's events):
${formatEvents(events)}

EMAILS (unread last 12h):
${formatEmails(emails)}

PIPELINE (stale active candidates):
${formatCandidates(candidates)}

MARKET INTEL:
${formatMarket(news)}`;

  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

module.exports = { synthesizeBriefing };
