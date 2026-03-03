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

const { searchGmailThreads }    = require('./modules/callprep/gmailSearch');
const { searchFirestoreRecords } = require('./modules/callprep/firestoreSearch');
const { searchJobsCollection }   = require('./modules/callprep/jobsSearch');
const { getCompanyIntel }        = require('./modules/callprep/companyIntel');
const { findDecisionMakers }     = require('./modules/callprep/decisionMakers');
const { synthesizeCallPrep }     = require('./modules/callprep/synthesizer');

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
    const authClient = createGoogleAuthClient();
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const [jobsR, candidatesR, intelR, decisionsR] = await Promise.allSettled([
      searchJobsCollection(db, query),
      searchFirestoreRecords(db, query),
      getCompanyIntel(process.env.TAVILY_API_KEY, query),
      findDecisionMakers(process.env.TAVILY_API_KEY, query),
    ]);

    const jobsData        = jobsR.status       === 'fulfilled' ? jobsR.value       : { total: 0, byModule: {} };
    const candidates      = candidatesR.status === 'fulfilled' ? candidatesR.value : [];
    const intel           = intelR.status      === 'fulfilled' ? intelR.value      : {};
    const decisionMakers  = decisionsR.status  === 'fulfilled' ? decisionsR.value  : [];

    if (jobsR.status       === 'rejected') logger.error('callprep:jobs',     jobsR.reason?.message);
    if (candidatesR.status === 'rejected') logger.error('callprep:pipeline',  candidatesR.reason?.message);
    if (intelR.status      === 'rejected') logger.error('callprep:intel',     intelR.reason?.message);
    if (decisionsR.status  === 'rejected') logger.error('callprep:decisions', decisionsR.reason?.message);

    const brief = await synthesizeCallPrep(anthropicClient, {
      company: query,
      jobsData,
      candidates,
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
      candidates: candidates.length,
      decisionMakers: decisionMakers.length,
    });
  }
);
