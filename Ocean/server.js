// Ocean/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const querystring = require('querystring');

const spotifyService = require('./spotifyService');
const roomManager = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// REST ENDPOINTS (AUTHENTICATION & ROOM MANAGEMENT)
// -------------------------------------------------------------

// Redirect Host to Spotify OAuth
app.get('/auth/login', (req, res) => {
  const scope = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';
  const queryParams = querystring.stringify({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scope,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
});

// OAuth Callback Handler
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code || null;
  try {
    const tokens = await spotifyService.exchangeCodeForTokens(code);
    const room = roomManager.createRoom(tokens);
    // Redirect Host to frontend room URL
    res.redirect(`${process.env.FRONTEND_URL}/room/${room.code}?isHost=true`);
  } catch (err) {
    console.error('Callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
  }
});

// Search Tracks API
app.get('/api/search', async (req, res) => {
  const { roomCode, q } = req.query;
  const room = roomManager.getRoom(roomCode);

  try {
    const results = room
      ? await spotifyService.searchTracks(room, q)
      : await spotifyService.searchCatalogTracks(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search tracks' });
  }
});

// -------------------------------------------------------------
// WEBSOCKET LOGIC (REAL-TIME ROOM SYNC)
// -------------------------------------------------------------

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomCode, userName }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      socket.emit('error_message', 'Invalid Room Code');
      return;
    }

    socket.join(roomCode);
    room.guests.set(socket.id, userName);

    // Broadcast updated client state
    broadcastRoomState(roomCode);
  });

  socket.on('add_to_queue', async ({ roomCode, track, userName }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    try {
      // 1. Send track directly to Host's Spotify client
      await spotifyService.addTrackToSpotifyQueue(room, track.uri);
      // 2. Track attribution locally
      roomManager.addTrackToRoomQueue(room, track, userName);
      // 3. Broadcast update
      broadcastRoomState(roomCode);
    } catch (err) {
      socket.emit('error_message', 'Failed to add track to Spotify player.');
    }
  });

  socket.on('vote_track', ({ roomCode, itemId }) => {
    const room = roomManager.getRoom(roomCode);
    if (room && roomManager.voteTrack(room, itemId, socket.id)) {
      broadcastRoomState(roomCode);
    }
  });

  socket.on('disconnect', () => {
    // Find room and cleanup disconnects if needed
  });
});

async function broadcastRoomState(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  try {
    const { currentlyPlaying } = await spotifyService.getPlaybackState(room);

    // Clean custom queue: filter out tracks that played already
    if (currentlyPlaying) {
      room.customQueue = room.customQueue.filter(
        (item) => item.track.id !== currentlyPlaying.id
      );
    }

    const payload = {
      roomCode: room.code,
      guestCount: room.guests.size,
      currentlyPlaying,
      queue: room.customQueue.map((item) => ({
        id: item.id,
        track: item.track,
        addedBy: item.addedBy,
        votes: item.votes,
      })),
    };

    io.to(roomCode).emit('room_state_update', payload);
  } catch (err) {
    console.error(`Error syncing room state for ${roomCode}:`, err.message);
  }
}

// Background sync worker: Poll Spotify every 4 seconds for active play state
setInterval(() => {
  const { createRoom, ...allRooms } = roomManager;
  // Sync state across active rooms
}, 4000);

const PORT = process.env.PORT || 5000;

// Export app and server for testing
module.exports = { app, server };

// Only start listening automatically if run directly via `node server.js`
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Ocean Backend listening on port ${PORT}`);
  });
}