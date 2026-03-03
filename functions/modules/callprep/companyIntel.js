'use strict';

function buildSearches(companyName) {
  return [
    { key: 'projectWins',  query: `"${companyName}" SAP project win contract announcement 2025 2026` },
    { key: 'leadership',   query: `"${companyName}" SAP practice leadership hiring director VP 2026` },
    { key: 'partnerships', query: `"${companyName}" SAP partnership alliance S4HANA SuccessFactors 2025 2026` },
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
      max_results: 4,
      days: 90,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${key} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    key,
    answer: data.answer || null,
    results: (data.results || []).map(({ title, url, content, published_date }) => ({ title, url, content, published_date })),
  };
}

async function getCompanyIntel(apiKey, companyName) {
  const searches = buildSearches(companyName);
  const settled  = await Promise.allSettled(searches.map((s) => runSearch(apiKey, s)));

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
