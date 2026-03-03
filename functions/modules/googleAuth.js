'use strict';

const { UserRefreshClient } = require('google-auth-library');

function createGoogleAuthClient() {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID');
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) throw new Error('Missing GOOGLE_OAUTH_CLIENT_SECRET');
  if (!process.env.GOOGLE_REFRESH_TOKEN) throw new Error('Missing GOOGLE_REFRESH_TOKEN');

  return new UserRefreshClient({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  });
}

async function getAccessToken(authClient) {
  const { token } = await authClient.getAccessToken();
  if (!token) throw new Error('Google OAuth: failed to obtain access token');
  return token;
}

module.exports = { createGoogleAuthClient, getAccessToken };
