'use strict';

function formatJobs(jobsData) {
  if (!jobsData || jobsData.total === 0) return '• No active SAP job postings found.';
  const lines = [`• Total open SAP roles: ${jobsData.total}`];
  for (const [mod, jobs] of Object.entries(jobsData.byModule)) {
    const oldest = jobs[0];
    const ageStr = oldest.daysPosted !== null ? `${oldest.daysPosted}d old` : 'age unknown';
    const staleFlag = jobs.some((j) => j.stale) ? ' ⚠️' : '';
    lines.push(`• ${mod}: ${jobs.length} role${jobs.length !== 1 ? 's' : ''} (oldest: ${ageStr}${staleFlag})`);
  }
  return lines.join('\n');
}

function formatProfile(profile) {
  if (!profile) return '• No company profile found in database.';
  const lines = [];
  if (profile.tier) lines.push(`• Tier: *${profile.tier.toUpperCase()}*`);
  if (profile.sapModules?.length) lines.push(`• SAP modules in use: ${profile.sapModules.join(', ')}`);
  if (profile.website) lines.push(`• Website: ${profile.website}`);
  return lines.length ? lines.join('\n') : '• No profile details available.';
}

function formatIntel(intel) {
  const parts = [];
  if (intel.projectWins?.answer)  parts.push(`_Project Wins:_ ${intel.projectWins.answer}`);
  if (intel.leadership?.answer)   parts.push(`_Leadership:_ ${intel.leadership.answer}`);
  if (intel.partnerships?.answer) parts.push(`_Partnerships:_ ${intel.partnerships.answer}`);
  return parts.length ? parts.join('\n') : '• No recent web intel found.';
}

function formatDecisionMakers(dms) {
  if (!dms.length) return '• No decision makers found in database.';
  return dms.slice(0, 5).map((dm) => {
    const contact = [dm.email, dm.phone].filter(Boolean).join(' | ');
    const linkedin = dm.linkedin ? `\n  🔗 ${dm.linkedin}` : '';
    return `• *${dm.name}* — ${dm.title || 'Unknown title'}${contact ? `\n  📧 ${contact}` : ''}${linkedin}`;
  }).join('\n');
}

async function synthesizeCallPrep(anthropicClient, { company, profile, jobsData, intel, decisionMakers }) {
  const prompt = `You are a pre-call prep assistant for an SAP staffing and consulting sales professional.

Preparing a brief for a call/meeting with: *${company}*

Write a Slack-formatted call brief with EXACTLY these 6 sections (use *SECTION* for bold headers):

*OPEN ROLES* — Their active SAP job postings by module; flag ⚠️ stale roles as hot opportunities
*COMPANY PROFILE* — Their SAP footprint (modules in use), tier classification, any key context
*INTEL* — Recent SAP project wins, leadership moves, partnerships from the web
*DECISION MAKERS* — Key contacts from our database with title, email, phone, LinkedIn
*TALKING POINTS* — 3 specific, personalized conversation openers based on their open roles and news
*SUGGESTED ACTION* — One concrete next step: who to contact first, what to pitch, why now

Rules:
- Max 5 bullets per section. Use • for bullets.
- Be direct and specific — reference actual job titles, module names, contact names from the data.
- Stale roles (⚠️ open 30+ days) signal urgency: budget is confirmed, they're struggling to fill.
- Talking points must reference THIS company's specific data — no generic openers.
- Suggested action must name a specific decision maker if available.
- If a section has no data: "• No data available"

--- DATA ---

OPEN SAP ROLES (jobs_norm database):
${formatJobs(jobsData)}

COMPANY SAP PROFILE (companies database):
${formatProfile(profile)}

WEB INTEL (last 90 days):
${formatIntel(intel)}

DECISION MAKERS (our database):
${formatDecisionMakers(decisionMakers)}`;

  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

module.exports = { synthesizeCallPrep };
