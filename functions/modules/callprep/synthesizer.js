'use strict';

function formatJobs(jobsData) {
  if (!jobsData || jobsData.total === 0) return '• No active SAP job postings found in database.';

  const lines = [`• Total open SAP roles: ${jobsData.total}`];
  for (const [mod, jobs] of Object.entries(jobsData.byModule)) {
    const oldest  = jobs[0]; // already sorted desc by daysPosted
    const ageStr  = oldest.daysPosted !== null ? `${oldest.daysPosted}d old` : 'age unknown';
    const stale   = jobs.some((j) => j.stale) ? ' ⚠️ stale' : '';
    lines.push(`• ${mod}: ${jobs.length} role${jobs.length !== 1 ? 's' : ''} (oldest: ${ageStr}${stale})`);
  }
  return lines.join('\n');
}

function formatIntel(intel) {
  const parts = [];
  if (intel.projectWins?.answer)  parts.push(`_Project Wins:_ ${intel.projectWins.answer}`);
  if (intel.leadership?.answer)   parts.push(`_Leadership/Hiring:_ ${intel.leadership.answer}`);
  if (intel.partnerships?.answer) parts.push(`_Partnerships:_ ${intel.partnerships.answer}`);
  return parts.length ? parts.join('\n') : '• No recent intel found.';
}

function formatDecisionMakers(dms) {
  if (!dms.length) return '• No LinkedIn profiles found.';
  return dms.map((dm) => `• *${dm.name}* — ${dm.title}\n  ${dm.url}`).join('\n');
}

function formatCandidates(records) {
  if (!records.length) return '• No past submissions or placements on record.';
  return records.map((r) =>
    `• *${r.name || 'Unknown'}* — ${r.role || 'N/A'} [${r.status || 'unknown'}]`
  ).join('\n');
}

async function synthesizeCallPrep(anthropicClient, { company, jobsData, intel, decisionMakers, candidates }) {
  const prompt = `You are a pre-call prep assistant for an SAP staffing and consulting sales professional.

Preparing a brief for: *${company}*

Write a concise, Slack-formatted call brief with EXACTLY these 6 sections (use *SECTION* for headers):

*OPEN ROLES* — Their active SAP job postings grouped by module, call out stale roles (⚠️) as urgency signals
*INTEL* — Recent SAP project wins, partnerships, and practice news
*DECISION MAKERS* — LinkedIn profiles to target (name, title, URL)
*PIPELINE* — Any past candidate submissions or placements on record
*TALKING POINTS* — 3 specific conversation openers referencing their open roles and recent news
*SUGGESTED ACTION* — One concrete next step: who to call, what to pitch, why now

Rules:
- Max 5 bullets per section. Use • for bullets.
- Be specific — reference actual job titles, news items, names from the data.
- Stale roles (⚠️) = been open 30+ days, signal urgency and budget confirmation.
- Talking points must be personalized to THIS company's data, not generic.
- Suggested action must name a specific decision maker if available.
- If a section has no data, write: "• No data available"

--- DATA ---

OPEN SAP ROLES (from internal jobs database):
${formatJobs(jobsData)}

COMPANY INTEL (last 90 days):
${formatIntel(intel)}

DECISION MAKERS (LinkedIn X-ray):
${formatDecisionMakers(decisionMakers)}

PAST SUBMISSIONS / PLACEMENTS:
${formatCandidates(candidates)}`;

  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

module.exports = { synthesizeCallPrep };
