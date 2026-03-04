'use strict';

async function getCompanyProfile(db, company) {
  const suffix = company + '\uf8ff';

  const snap = await db.collection('companies')
    .where('companyName', '>=', company)
    .where('companyName', '<=', suffix)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const d = snap.docs[0].data();
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
