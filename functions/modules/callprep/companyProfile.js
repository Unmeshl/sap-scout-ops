'use strict';

function prefixRanges(query) {
  const firstWord = query.trim().split(/\s+/)[0];
  const upper = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
  const lower = firstWord.charAt(0).toLowerCase() + firstWord.slice(1);
  return [
    { start: upper, end: upper + '\uf8ff' },
    ...(lower !== upper ? [{ start: lower, end: lower + '\uf8ff' }] : []),
  ];
}

async function getCompanyProfile(db, company) {
  const ranges = prefixRanges(company);
  const queryLower = company.trim().toLowerCase();

  const snapshots = await Promise.all(
    ranges.map((r) =>
      db.collection('companies')
        .where('companyName', '>=', r.start)
        .where('companyName', '<=', r.end)
        .get()
    )
  );

  const allDocs = [];
  const seen = new Set();
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      if (!seen.has(doc.id)) { seen.add(doc.id); allDocs.push(doc); }
    }
  }

  const match = allDocs.find((doc) =>
    (doc.data().companyName || '').toLowerCase().includes(queryLower)
  );
  if (!match) return null;

  const d = match.data();
  return {
    name: d.companyName || d.name || company,
    tier: d.tierInfo?.tier || null,
    sapModules: d.sapModules || [],
    website: d.website || null,
    companyDomain: d.companyDomain || null,
  };
}

async function getDecisionMakersFromDB(db, companyDomain) {
  if (!companyDomain) return [];

  const snap = await db.collection('decision_makers')
    .where('companies', 'array-contains', companyDomain)
    .where('deletedAt', '==', null)
    .limit(10)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      name: d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown',
      title: d.title || null,
      email: d.email || null,
      phone: d.custom_direct_phone_number || d.custom_mobile_phone || d.phone || null,
      linkedin: d.custom_linkedin_contact_profile_url || d.linkedinProfileUrl || null,
      managementLevel: d.custom_management_level || null,
    };
  });
}

module.exports = { getCompanyProfile, getDecisionMakersFromDB };
