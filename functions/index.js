'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Anthropic = require('@anthropic-ai/sdk');

const { createGoogleAuthClient } = require('./modules/googleAuth');
const { getTodaysEvents }        = require('./modules/calendar');
const { getUrgentEmails }        = require('./modules/gmail');
const { getStaleCandidates }     = require('./modules/pipeline');
const { getSAPMarketNews }       = require('./modules/marketIntel');
const { synthesizeBriefing }     = require('./modules/synthesizer');
const { postToSlack }            = require('./modules/slack');

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
