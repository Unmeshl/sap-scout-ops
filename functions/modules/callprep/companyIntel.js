'use strict';

function buildSearches(companyName) {
  return [
    { key: 'news',   query: `${companyName} SAP news 2026` },
    { key: 'wins',   query: `${companyName} SAP project win partnership contract 2026` },
    { key: 'hiring', query: `${companyName} technology hiring executive announcement 2026` },
  ];
}

async function runSearch(apiKey, { key, query }) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 3,
      days: 30,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${key} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { key, answer: data.answer || null, results: data.results || [] };
}

async function getCompanyIntel(apiKey, companyName) {
  const searches = buildSearches(companyName);
  const settled = await Promise.allSettled(searches.map((s) => runSearch(apiKey, s)));

  const output = {};
  for (let i = 0; i < searches.length; i++) {
    const { key } = searches[i];
    output[key] = settled[i].status === 'fulfilled'
      ? { answer: settled[i].value.answer, results: settled[i].value.results }
      : { answer: null, results: [] };
  }
  return output;
}

module.exports = { getCompanyIntel };
