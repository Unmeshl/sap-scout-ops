'use strict';

function formatEmails(emails) {
  if (!emails.length) return 'No recent email threads found.';
  return emails.map((e) =>
    `• *${e.subject}* (${e.messageCount} msg${e.messageCount !== 1 ? 's' : ''}, last: ${e.date || 'unknown'})\n  ${e.snippet || ''}`
  ).join('\n');
}

function formatRecords(records) {
  if (!records.length) return 'No matching Firestore records.';
  return records.map((r) =>
    `• *${r.name || 'Unknown'}* — ${r.role || 'N/A'} @ ${r.company || 'N/A'} [${r.status || 'unknown'}]`
  ).join('\n');
}

function formatIntel(intel) {
  const parts = [];
  if (intel.news?.answer)   parts.push(`_News:_ ${intel.news.answer}`);
  if (intel.wins?.answer)   parts.push(`_Wins:_ ${intel.wins.answer}`);
  if (intel.hiring?.answer) parts.push(`_Hiring:_ ${intel.hiring.answer}`);
  return parts.length ? parts.join('\n') : 'No recent intel found.';
}

async function synthesizeCallPrep(anthropicClient, { query, emails, records, intel }) {
  const prompt = `You are a pre-call prep assistant for an SAP staffing and consulting sales professional.

The user is about to call or meet with: "${query}"

Write a concise Slack-formatted brief with EXACTLY these 4 sections (use *SECTION* for headers):

*HISTORY* — Key context from past email threads with this contact/company
*INTEL* — Recent company news, SAP activity, and market moves
*PIPELINE* — Any active candidates, open roles, or past placements on record
*TALKING POINTS* — 3 specific, personalized conversation openers based on the intel above

Rules:
- 3-5 bullets per section max, use • for bullets
- Be specific and actionable — no generic filler
- If a section has no data, write a single bullet: "• No data available"
- Talking points must reference specific intel, not be generic

--- DATA ---

EMAIL THREADS (last 5 with "${query}"):
${formatEmails(emails)}

FIRESTORE RECORDS:
${formatRecords(records)}

COMPANY INTEL (last 30 days):
${formatIntel(intel)}`;

  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

module.exports = { synthesizeCallPrep };
