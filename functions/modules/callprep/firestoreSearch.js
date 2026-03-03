'use strict';

async function searchFirestoreRecords(db, query) {
  const suffix = query + '\uf8ff';

  const [byCompany, byName] = await Promise.allSettled([
    db.collection('candidates')
      .where('company', '>=', query)
      .where('company', '<=', suffix)
      .limit(20)
      .get(),
    db.collection('candidates')
      .where('name', '>=', query)
      .where('name', '<=', suffix)
      .limit(20)
      .get(),
  ]);

  const seen = new Set();
  const records = [];

  for (const result of [byCompany, byName]) {
    if (result.status !== 'fulfilled') continue;
    for (const doc of result.value.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const d = doc.data();
      records.push({
        id: doc.id,
        name: d.name || null,
        company: d.company || null,
        role: d.role || null,
        status: d.status || null,
        lastUpdated: d.lastUpdated?.toMillis
          ? new Date(d.lastUpdated.toMillis()).toISOString()
          : null,
      });
    }
  }

  return records;
}

module.exports = { searchFirestoreRecords };
