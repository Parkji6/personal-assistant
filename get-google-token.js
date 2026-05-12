const http = require('http');
const url = require('url');
const { exec } = require('child_process');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('Missing env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI');
  process.exit(1);
}

// Step 1: Open browser to get auth code
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly%20https://www.googleapis.com/auth/calendar`;

console.log('\n🔐 Opening browser to authorize...\n');
console.log('Auth URL:', authUrl);
exec(`start "${authUrl}"`, (err) => {
  if (err) console.log('\nPlease visit:', authUrl);
});

// Step 2: Listen for callback
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const code = parsedUrl.query.code;
  const error = parsedUrl.query.error;

  if (error) {
    res.end(`Error: ${error}`);
    console.error('❌ Authorization failed:', error);
    process.exit(1);
  }

  if (!code) {
    res.end('Waiting for authorization...');
    return;
  }

  res.end('✅ Authorization successful! Getting tokens...');

  // Step 3: Exchange code for tokens
  const tokenParams = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: tokenParams,
    });

    const data = await response.json();

    if (data.access_token) {
      console.log('\n✅ SUCCESS!\n');
      console.log('ACCESS_TOKEN:', data.access_token);
      console.log('\nSet this in Vercel:');
      console.log('GOOGLE_ACCESS_TOKEN=' + data.access_token);
      if (data.refresh_token) {
        console.log('\nRefresh token (optional for production):');
        console.log('GOOGLE_REFRESH_TOKEN=' + data.refresh_token);
      }
    } else {
      console.error('❌ Failed to get token:', data);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
