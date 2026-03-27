#!/usr/bin/env node

/**
 * Generate a Google OAuth Refresh Token
 *
 * This script obtains a refresh token with Calendar + Contacts scopes
 * using the Desktop OAuth flow (localhost redirect).
 *
 * Usage:
 *   node scripts/generate-refresh-token.js <GOOGLE_CLIENT_SECRET>
 *   node scripts/generate-refresh-token.js   (will prompt for secret)
 */

const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
const { exec } = require('child_process');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CLIENT_ID =
  '911732821146-sbp3v0qmoufbnsrnqln265rbq6rm2fb4.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/contacts',
];

const REDIRECT_URI = 'http://localhost:3456';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(chunks));
        } catch {
          reject(new Error(`Non-JSON response: ${chunks}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error('Could not open browser automatically. Open this URL manually.');
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  // 1. Get the client secret
  let clientSecret = process.argv[2];
  if (!clientSecret) {
    clientSecret = await prompt('Enter your GOOGLE_CLIENT_SECRET (ending in ruNN): ');
  }
  if (!clientSecret) {
    console.error('Error: GOOGLE_CLIENT_SECRET is required.');
    process.exit(1);
  }

  // 2. Build the authorization URL
  const authParams = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;

  console.log();
  console.log('Google OAuth Refresh Token Generator');
  console.log('====================================');
  console.log();
  console.log(`Scopes: ${SCOPES.join(', ')}`);
  console.log();
  console.log('Opening browser for authorization...');
  console.log();

  openBrowser(authUrl);

  // 3. Try localhost server first, fall back to manual paste
  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname !== '/') { res.writeHead(404); res.end(); return; }

    const { code, error } = parsed.query;
    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h2>Error: ${error}</h2>`);
      console.error(`\nAuthorization error: ${error}`);
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Success! Return to your terminal.</h2>');
    server.close();
    await exchangeCode(code, clientSecret);
  });

  server.listen(3456, () => {
    console.log('Listening on http://localhost:3456 for redirect...');
    console.log();
    console.log('If the browser redirects but the page does not load,');
    console.log('copy the FULL URL from the browser address bar and paste it below.');
    console.log();
  });

  server.on('error', () => {
    console.log('Could not start localhost server.');
    console.log('After authorizing, copy the FULL URL from the browser and paste below.');
    console.log();
  });

  // Also offer manual paste as fallback (wait 10s for auto-redirect first)
  setTimeout(async () => {
    // If server already handled it, this won't run (process would have exited)
    const pastedUrl = await prompt('\nPaste the redirect URL here (or wait for auto-redirect): ');
    if (pastedUrl) {
      server.close();
      const parsed = url.parse(pastedUrl, true);
      const code = parsed.query?.code;
      if (!code) {
        console.error('No authorization code found in that URL.');
        process.exit(1);
      }
      await exchangeCode(code, clientSecret);
    }
  }, 10000);

  // Safety timeout
  setTimeout(() => {
    console.error('\nTimed out after 5 minutes. Exiting.');
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000).unref();
})();

async function exchangeCode(code, clientSecret) {
  console.log('\nExchanging authorization code for tokens...');
  try {
    const tokenResponse = await httpsPost('oauth2.googleapis.com', '/token', {
      code,
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    if (tokenResponse.error) {
      console.error('\nToken exchange error:', tokenResponse);
      process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('  NEW REFRESH TOKEN');
    console.log('='.repeat(60));
    console.log();
    console.log(tokenResponse.refresh_token);
    console.log();
    console.log('='.repeat(60));
    console.log();
    console.log('Scopes granted:', tokenResponse.scope);
    console.log();
    console.log('NEXT STEPS:');
    console.log('  1. Copy the refresh token above');
    console.log('  2. Update GOOGLE_REFRESH_TOKEN in:');
    console.log('     - hPanel: Websites > Node.js > Environment Variables');
    console.log('     - Render: Dashboard > Service > Environment > Edit');
    console.log('  3. Redeploy / restart the service');
    console.log();
    process.exit(0);
  } catch (err) {
    console.error('\nError exchanging code:', err.message);
    process.exit(1);
  }
}
