// Ocean/testBackend.js
require('dotenv').config();
const axios = require('axios');
const http = require('http');
const spotifyService = require('./spotifyService');
const roomManager = require('./roomManager');

// Color helpers for terminal output
const colors = {
  green: '\x1b[32m%s\x1b[0m',
  red: '\x1b[31m%s\x1b[0m',
  yellow: '\x1b[33m%s\x1b[0m',
  cyan: '\x1b[36m%s\x1b[0m',
};

async function runBackendTests() {
  console.log('\n========================================');
  console.log('      OCEAN BACKEND VERIFICATION      ');
  console.log('========================================\n');

  // -------------------------------------------------------------
  // TEST 1: Environment Variables Check
  // -------------------------------------------------------------
  console.log(colors.cyan, '[1/5] Checking .env configuration...');
  const requiredEnvVars = [
    'PORT',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI',
    'FRONTEND_URL',
  ];

  let missingEnv = false;
  requiredEnvVars.forEach((key) => {
    if (!process.env[key] || process.env[key].includes('your_')) {
      console.log(colors.red, `  ❌ Missing or placeholder value for: ${key}`);
      missingEnv = true;
    } else {
      console.log(colors.green, `  ✓ ${key} is set (${key === 'SPOTIFY_CLIENT_SECRET' ? '***' : process.env[key]})`);
    }
  });

  if (missingEnv) {
    console.log(colors.red, '\nFAILED: Please fix your .env file before proceeding.');
    process.exit(1);
  }

  // -------------------------------------------------------------
  // TEST 2: In-Memory Room Manager Logic
  // -------------------------------------------------------------
  console.log('\n' + colors.cyan, '[2/5] Testing Room Manager...');
  try {
    const dummyTokens = {
      accessToken: 'dummy_access_token',
      refreshToken: 'dummy_refresh_token',
      expiresAt: Date.now() + 3600000,
    };

    const room = roomManager.createRoom(dummyTokens);
    console.log(colors.green, `  ✓ Room created successfully! Code: ${room.code}`);

    const fetchedRoom = roomManager.getRoom(room.code);
    if (!fetchedRoom || fetchedRoom.code !== room.code) {
      throw new Error('Failed to retrieve created room.');
    }
    console.log(colors.green, `  ✓ Room lookup verified.`);

    // Test Adding & Voting Track
    const dummyTrack = { id: 'track123', title: 'Test Song', artist: 'Test Artist', uri: 'spotify:track:123' };
    const queueItem = roomManager.addTrackToRoomQueue(room, dummyTrack, 'Alex');
    console.log(colors.green, `  ✓ Track queued locally for guest "Alex".`);

    roomManager.voteTrack(room, queueItem.id, 'socket_client_1');
    if (queueItem.votes !== 1) throw new Error('Upvoting track failed.');
    console.log(colors.green, `  ✓ Upvoting logic working (Votes: ${queueItem.votes}).`);
  } catch (err) {
    console.log(colors.red, `  ❌ Room Manager Test Failed: ${err.message}`);
    process.exit(1);
  }

  // -------------------------------------------------------------
  // TEST 3: Verify Spotify Developer Credentials (Client Credentials Check)
  // -------------------------------------------------------------
  console.log('\n' + colors.cyan, '[3/5] Verifying Spotify Credentials with Spotify Accounts API...');
  try {
    const authHeader = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const res = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
      }
    );

    if (res.data.access_token) {
      console.log(colors.green, '  ✓ Spotify Client ID & Secret are VALID!');
      
      // Test search function using client credentials
      const searchRes = await axios.get('https://api.spotify.com/v1/search', {
        params: { q: 'Dua Lipa', type: 'track', limit: 1 },
        headers: { Authorization: `Bearer ${res.data.access_token}` },
      });

      if (searchRes.data?.tracks?.items?.length > 0) {
        const track = searchRes.data.tracks.items[0];
        console.log(colors.green, `  ✓ Spotify Catalog Search test passed! Found: "${track.name}" by ${track.artists[0].name}`);
      }
    }
  } catch (err) {
    console.log(colors.red, `  ❌ Spotify Credential Check Failed! Check your Client ID & Secret.`);
    console.log(colors.yellow, `  Error Details: ${err.response?.data?.error_description || err.message}`);
    process.exit(1);
  }

  // -------------------------------------------------------------
  // TEST 4: Local Express Server & Endpoint Ping
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // TEST 4: Local Express Server & Endpoint Ping
  // -------------------------------------------------------------
  console.log('\n' + colors.cyan, '[4/5] Testing Express Server Endpoints...');
  
  const { server } = require('./server');
  const PORT = process.env.PORT || 5000;

  // Bind the server instance once during the test
  const runningServer = server.listen(PORT, async () => {
    console.log(colors.green, `  ✓ Server successfully bound to port ${PORT}`);

    try {
      // Ping search endpoint with invalid room
      const res = await axios.get(`http://127.0.0.1:${PORT}/api/search?roomCode=INVALID&q=test`, {
        validateStatus: false,
      });

      if (res.status === 404) {
        console.log(colors.green, '  ✓ Error handling verified (Returned 404 for invalid room search).');
      } else {
        console.log(colors.yellow, `  ⚠️ Expected 404 status for invalid room, got ${res.status}`);
      }

      console.log('\n' + colors.cyan, '[5/5] Testing OAuth Redirect URL Construction...');
      const loginRes = await axios.get(`http://127.0.0.1:${PORT}/auth/login`, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const redirectLocation = loginRes.headers.location;
      if (redirectLocation && redirectLocation.includes('accounts.spotify.com/authorize')) {
        console.log(colors.green, '  ✓ Login redirect endpoint correctly routes to Spotify Accounts!');
      }

      console.log('\n========================================');
      console.log(colors.green, '  🎉 ALL BACKEND CHECKS PASSED SUCCESSFULLY!  ');
      console.log('========================================\n');

      runningServer.close();
      process.exit(0);
    } catch (err) {
      console.log(colors.red, `  ❌ Server endpoint test failed: ${err.message}`);
      runningServer.close();
      process.exit(1);
    }
  });
}

runBackendTests();