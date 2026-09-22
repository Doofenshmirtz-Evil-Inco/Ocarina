// Ocean/spotifyService.js
const axios = require('axios');
const querystring = require('querystring');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

/**
 * Exchange Authorization Code for Access & Refresh Tokens
 */
async function exchangeCodeForTokens(code) {
  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    querystring.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
    }
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
    expiresAt: Date.now() + response.data.expires_in * 1000,
  };
}

/**
 * Automatically refresh expired Host access token
 */
async function refreshAccessToken(room) {
  if (Date.now() < room.expiresAt - 60000) {
    return room.accessToken; // Token still valid
  }

  try {
    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: room.refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
      }
    );

    room.accessToken = response.data.access_token;
    room.expiresAt = Date.now() + response.data.expires_in * 1000;
    if (response.data.refresh_token) {
      room.refreshToken = response.data.refresh_token;
    }
    return room.accessToken;
  } catch (err) {
    console.error(`Failed to refresh token for room ${room.code}:`, err.response?.data || err.message);
    throw err;
  }
}

/**
 * Search Spotify Tracks
 */
async function searchTracks(room, query) {
  const token = await refreshAccessToken(room);
  const response = await axios.get('https://api.spotify.com/v1/search', {
    params: { q: query, type: 'track', limit: 10 },
    headers: { Authorization: `Bearer ${token}` },
  });

  return response.data.tracks.items.map((track) => ({
    id: track.id,
    uri: track.uri,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    albumArt: track.album.images[0]?.url || '',
    durationMs: track.duration_ms,
  }));
}

async function searchCatalogTracks(query) {
  const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenResponse = await axios.post(
    'https://accounts.spotify.com/api/token',
    querystring.stringify({ grant_type: 'client_credentials' }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${authHeader}` } }
  );
  const response = await axios.get('https://api.spotify.com/v1/search', {
    params: { q: query, type: 'track', limit: 10 },
    headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
  });
  return response.data.tracks.items.map((track) => ({
    id: track.id,
    uri: track.uri,
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    albumArt: track.album.images[0]?.url || '',
    durationMs: track.duration_ms,
  }));
}

/**
 * Push Track to Host's Active Spotify Queue
 */
async function addTrackToSpotifyQueue(room, trackUri) {
  const token = await refreshAccessToken(room);
  await axios.post(
    `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

/**
 * Fetch Currently Playing & Spotify Queue
 */
async function getPlaybackState(room) {
  const token = await refreshAccessToken(room);

  try {
    const [currentlyPlayingRes, queueRes] = await Promise.all([
      axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      axios.get('https://api.spotify.com/v1/me/player/queue', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const currentlyPlaying = currentlyPlayingRes.data?.item
      ? {
          id: currentlyPlayingRes.data.item.id,
          uri: currentlyPlayingRes.data.item.uri,
          title: currentlyPlayingRes.data.item.name,
          artist: currentlyPlayingRes.data.item.artists.map((a) => a.name).join(', '),
          albumArt: currentlyPlayingRes.data.item.album.images[0]?.url || '',
          progressMs: currentlyPlayingRes.data.progress_ms,
          durationMs: currentlyPlayingRes.data.item.duration_ms,
          isPlaying: currentlyPlayingRes.data.is_playing,
        }
      : null;

    return { currentlyPlaying, spotifyQueue: queueRes.data?.queue || [] };
  } catch (err) {
    if (err.response?.status === 204) return { currentlyPlaying: null, spotifyQueue: [] };
    throw err;
  }
}

module.exports = {
  exchangeCodeForTokens,
  searchTracks,
  searchCatalogTracks,
  addTrackToSpotifyQueue,
  getPlaybackState,
};