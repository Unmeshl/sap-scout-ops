'use strict';

const SAP_MODULE_KEYWORDS = [
  { module: 'SuccessFactors', keywords: ['SuccessFactors', 'SFSF', 'SF EC', 'SF LMS', 'SF Recruiting', 'SF Compensation'] },
  { module: 'S/4HANA',        keywords: ['S/4HANA', 'S4HANA', 'S4 HANA', 'HANA Migration', 'Rise with SAP'] },
  { module: 'FICO',           keywords: ['FICO', 'FI/CO', 'Finance', 'Controlling', 'Accounts Payable', 'Accounts Receivable', 'General Ledger', 'Asset Accounting'] },
  { module: 'MM',             keywords: ['MM', 'Materials Management', 'Procurement', 'Purchasing', 'Inventory', 'Ariba'] },
  { module: 'SD',             keywords: ['SD', 'Sales Distribution', 'Order Management', 'Order-to-Cash'] },
  { module: 'ABAP',           keywords: ['ABAP', 'Fiori', 'OData', 'BTP', 'Integration', 'PI/PO', 'CPI'] },
  { module: 'Basis',          keywords: ['Basis', 'NetWeaver', 'System Admin', 'Security', 'GRC'] },
  { module: 'HCM',            keywords: ['HCM', 'Human Capital', 'Payroll', 'Time Management'] },
  { module: 'EWM/WM',         keywords: ['EWM', 'Extended Warehouse', 'Warehouse Management'] },
  { module: 'SCM/IBP',        keywords: ['SCM', 'Supply Chain', 'APO', 'IBP', 'Demand Planning'] },
  { module: 'BW/BI',          keywords: ['BW', 'BI', 'Business Intelligence', 'Analytics', 'BW/4HANA', 'Datasphere', 'Analytics Cloud'] },
  { module: 'PP',             keywords: ['PP', 'Production Planning', 'Manufacturing', 'MRP'] },
  { module: 'PM/EAM',         keywords: ['PM', 'Plant Maintenance', 'Asset Management', 'EAM'] },
  { module: 'CX/CRM',         keywords: ['CRM', 'Customer Experience', 'C4C', 'Hybris', 'Commerce'] },
];

function detectModule(title) {
  const upper = (title || '').toUpperCase();
  for (const { module, keywords } of SAP_MODULE_KEYWORDS) {
    for (const kw of keywords) {
      if (upper.includes(kw.toUpperCase())) return module;
    }
  }
  return 'SAP (Other)';
}

// Firestore range queries are case-sensitive (uppercase sorts before lowercase).
// Solution: run two parallel prefix queries — one uppercase-first, one
// lowercase-first — merge the docs, then filter case-insensitively in memory.
function prefixRanges(query) {
  const firstWord = query.trim().split(/\s+/)[0];
  const upper = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
  const lower = firstWord.charAt(0).toLowerCase() + firstWord.slice(1);
  return [
    { start: upper, end: upper + '\uf8ff' },
    ...(lower !== upper ? [{ start: lower, end: lower + '\uf8ff' }] : []),
  ];
}

async function searchJobsCollection(db, company) {
  const ranges = prefixRanges(company);
  const queryLower = company.trim().toLowerCase();
  const now = Date.now();

  const snapshots = await Promise.all(
    ranges.map((r) =>
      db.collection('jobs_norm')
        .where('companyName', '>=', r.start)
        .where('companyName', '<=', r.end)
        .get()
    )
  );

  // Merge docs, deduplicate by id
  const seen = new Set();
  const allDocs = [];
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      if (!seen.has(doc.id)) { seen.add(doc.id); allDocs.push(doc); }
    }
  }

  let companyDomain = null;
  const jobs = allDocs
    .map((doc) => {
      const d = doc.data();
      // Case-insensitive full-name match
      if (!(d.companyName || '').toLowerCase().includes(queryLower)) return null;
      // filter duplicates in-memory to avoid composite index requirement
      if (d.isDuplicate === true) return null;

      if (!companyDomain && d.companyDomain) companyDomain = d.companyDomain;

      const postedMs = d.postedAt ? new Date(d.postedAt).getTime() : null;
      const daysPosted = postedMs !== null ? Math.floor((now - postedMs) / 86400000) : null;

      return {
        id: doc.id,
        title: d.title || 'Unknown',
        module: detectModule(d.title),
        source: d.source || null,
        url: d.url || null,
        location: d.location || null,
        daysPosted,
        stale: daysPosted !== null && daysPosted > 30,
      };
    })
    .filter(Boolean);

  const byModule = {};
  for (const job of jobs) {
    if (!byModule[job.module]) byModule[job.module] = [];
    byModule[job.module].push(job);
  }
  for (const mod of Object.keys(byModule)) {
    byModule[mod].sort((a, b) => (b.daysPosted ?? 0) - (a.daysPosted ?? 0));
  }

  return { total: jobs.length, byModule, companyDomain };
}

module.exports = { searchJobsCollection };
