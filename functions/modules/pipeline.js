'use strict';

const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

async function getStaleCandidates(db) {
  const snapshot = await db
    .collection('candidates')
    .where('status', 'in', ['submitted', 'interviewing', 'offer'])
    .get();

  const now = Date.now();

  const stale = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const lastUpdatedMs = data.lastUpdated?.toMillis?.() ?? null;
      if (lastUpdatedMs === null) return null;

      const ageMs = now - lastUpdatedMs;
      if (ageMs < STALE_THRESHOLD_MS) return null;

      return {
        id: doc.id,
        name: data.name || null,
        company: data.company || null,
        role: data.role || null,
        status: data.status,
        lastUpdated: new Date(lastUpdatedMs).toISOString(),
        daysStale: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
      };
    })
    .filter(Boolean);

  stale.sort((a, b) => b.daysStale - a.daysStale);
  return stale;
}

module.exports = { getStaleCandidates };
