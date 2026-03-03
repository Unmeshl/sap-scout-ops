'use strict';

function parseLinkedInResult(result) {
  const url = result.url || '';
  if (!url.includes('linkedin.com/in/')) return null;

  const rawTitle = result.title || '';
  const content  = result.content || '';

  // LinkedIn titles: "First Last - Title at Company | LinkedIn"
  // or "First Last | Title | LinkedIn"
  let name  = 'Unknown';
  let title = 'Unknown';

  const dashSplit = rawTitle.split(/\s[-–]\s/);
  if (dashSplit.length >= 2) {
    name = dashSplit[0].trim();
    // strip trailing "| LinkedIn" or "at Company | LinkedIn"
    const rest = dashSplit.slice(1).join(' - ');
    title = rest.replace(/\s*\|.*$/, '').replace(/\s+at\s+[^|]+$/, '').trim();
  } else {
    const pipeSplit = rawTitle.split('|');
    name  = pipeSplit[0]?.trim() || 'Unknown';
    title = pipeSplit[1]?.trim() || 'Unknown';
  }

  // Fall back to first non-empty content line for title if still generic
  if (!title || title === 'Unknown') {
    const firstLine = content.split('\n').find((l) => l.trim().length > 5);
    title = firstLine?.trim() || 'Unknown';
  }

  return { name, title, url };
}

async function findDecisionMakers(apiKey, companyName) {
  const query = `site:linkedin.com/in "${companyName}" SAP (Director OR VP OR Partner OR "Practice Lead" OR "Managing Director" OR "Managing Partner" OR "Principal")`;

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: false,
      max_results: 8,
      days: 365,
    }),
  });

  if (!res.ok) throw new Error(`Tavily decisionMakers ${res.status}: ${await res.text()}`);

  const data = await res.json();

  return (data.results || [])
    .map(parseLinkedInResult)
    .filter(Boolean)
    .slice(0, 5);
}

module.exports = { findDecisionMakers };
