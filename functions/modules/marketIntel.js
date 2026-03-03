'use strict';

const SEARCHES = [
  { key: 'migrations',  query: 'SAP S/4HANA migration announcement today 2026' },
  { key: 'projectWins', query: 'Accenture Deloitte IBM Infosys Wipro SAP project win contract 2026 $50 million' },
  { key: 'execMoves',   query: 'Accenture Deloitte IBM Infosys Wipro executive appointment 2026' },
];

async function runSearch(apiKey, { key, query }) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 5,
      days: 1,
    }),
  });

  if (!res.ok) throw new Error(`Tavily ${key} ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return {
    key,
    answer: data.answer || null,
    results: (data.results || []).map(({ title, url, content, published_date }) => ({
      title, url, content, published_date,
    })),
  };
}

async function getSAPMarketNews(apiKey) {
  const settled = await Promise.allSettled(
    SEARCHES.map((s) => runSearch(apiKey, s))
  );

  const output = {};
  for (let i = 0; i < SEARCHES.length; i++) {
    const { key } = SEARCHES[i];
    const result = settled[i];
    output[key] = result.status === 'fulfilled'
      ? { answer: result.value.answer, results: result.value.results }
      : { answer: null, results: [] };
  }
  return output;
}

module.exports = { getSAPMarketNews };
