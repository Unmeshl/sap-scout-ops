'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { onMessagePublished } = require('firebase-functions/v2/pubsub');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Anthropic = require('@anthropic-ai/sdk');
const { PubSub } = require('@google-cloud/pubsub');

const { createGoogleAuthClient } = require('./modules/googleAuth');
const { getTodaysEvents }        = require('./modules/calendar');
const { getUrgentEmails }        = require('./modules/gmail');
const { getStaleCandidates }     = require('./modules/pipeline');
const { getSAPMarketNews }       = require('./modules/marketIntel');
const { synthesizeBriefing }     = require('./modules/synthesizer');
const { postToSlack }            = require('./modules/slack');

const { searchJobsCollection }           = require('./modules/callprep/jobsSearch');
const { getCompanyProfile,
        getDecisionMakersFromDB }         = require('./modules/callprep/companyProfile');
const { getCompanyIntel }                = require('./modules/callprep/companyIntel');
const { synthesizeCallPrep }             = require('./modules/callprep/synthesizer');

const CALLPREP_TOPIC = 'callprep-jobs';

if (!getApps().length) initializeApp();
setGlobalOptions({ maxInstances: 1 });

async function runPipeline() {
  const db = getFirestore();
  const authClient = createGoogleAuthClient();
  const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const [eventsR, emailsR, pipelineR, newsR] = await Promise.allSettled([
    getTodaysEvents(authClient),
    getUrgentEmails(authClient),
    getStaleCandidates(db),
    getSAPMarketNews(process.env.TAVILY_API_KEY),
  ]);

  const events     = eventsR.status   === 'fulfilled' ? eventsR.value   : [];
  const emails     = emailsR.status   === 'fulfilled' ? emailsR.value   : [];
  const candidates = pipelineR.status === 'fulfilled' ? pipelineR.value : [];
  const news       = newsR.status     === 'fulfilled' ? newsR.value     : {};

  if (eventsR.status   === 'rejected') logger.error('calendar',    eventsR.reason?.message);
  if (emailsR.status   === 'rejected') logger.error('gmail',       emailsR.reason?.message);
  if (pipelineR.status === 'rejected') logger.error('pipeline',    pipelineR.reason?.message);
  if (newsR.status     === 'rejected') logger.error('marketIntel', newsR.reason?.message);

  const briefing = await synthesizeBriefing(anthropicClient, { events, emails, candidates, news });
  await postToSlack(process.env.SLACK_WEBHOOK_URL, briefing);

  logger.info('morningIntel done', {
    events: events.length,
    emails: emails.length,
    candidates: candidates.length,
  });
}

exports.morningIntel = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'America/New_York',
    timeoutSeconds: 300,
    memory: '256MiB',
    retryCount: 2,
    minBackoffSeconds: 60,
  },
  async () => runPipeline()
);

exports.morningIntelTrigger = onRequest(
  { timeoutSeconds: 300, memory: '256MiB' },
  async (req, res) => {
    await runPipeline();
    res.status(200).send('Done');
  }
);

// ── callprep ──────────────────────────────────────────────────────────────────

exports.callprep = onRequest(
  { timeoutSeconds: 10, memory: '256MiB' },
  async (req, res) => {
    const query = (req.body?.text || '').trim();
    const responseUrl = req.body?.response_url;

    if (!query) {
      return res.status(200).json({ text: 'Usage: `/callprep [company or contact name]`' });
    }

    const pubsub = new PubSub();
    await pubsub.topic(CALLPREP_TOPIC).publishMessage({
      data: Buffer.from(JSON.stringify({ query, responseUrl })),
    });

    res.status(200).json({
      response_type: 'ephemeral',
      text: `🔍 Preparing call brief for *${query}*... check back in ~30 seconds.`,
    });
  }
);

exports.callprepWorker = onMessagePublished(
  { topic: CALLPREP_TOPIC, timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
    const { query, responseUrl } = JSON.parse(
      Buffer.from(event.data.message.data, 'base64').toString()
    );

    const db = getFirestore();
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Step 1: fetch jobs + company profile in parallel (both give us companyDomain)
    const [jobsR, profileR, intelR] = await Promise.allSettled([
      searchJobsCollection(db, query),
      getCompanyProfile(db, query),
      getCompanyIntel(process.env.TAVILY_API_KEY, query),
    ]);

    const jobsData = jobsR.status    === 'fulfilled' ? jobsR.value    : { total: 0, byModule: {}, companyDomain: null };
    const profile  = profileR.status === 'fulfilled' ? profileR.value : null;
    const intel    = intelR.status   === 'fulfilled' ? intelR.value   : {};

    if (jobsR.status    === 'rejected') logger.error('callprep:jobs',    jobsR.reason?.message);
    if (profileR.status === 'rejected') logger.error('callprep:profile', profileR.reason?.message);
    if (intelR.status   === 'rejected') logger.error('callprep:intel',   intelR.reason?.message);

    // Step 2: look up decision makers using domain (prefer jobs_norm domain, fall back to companies)
    const companyDomain = jobsData.companyDomain || profile?.companyDomain || null;
    const decisionMakers = companyDomain
      ? await getDecisionMakersFromDB(db, companyDomain).catch((e) => {
          logger.error('callprep:decisions', e.message);
          return [];
        })
      : [];

    const brief = await synthesizeCallPrep(anthropicClient, {
      company: query,
      profile,
      jobsData,
      intel,
      decisionMakers,
    });

    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'in_channel', text: brief }),
      });
    }

    logger.info('callprep done', {
      query,
      jobs: jobsData.total,
      decisionMakers: decisionMakers.length,
      companyDomain,
    });
  }
);
