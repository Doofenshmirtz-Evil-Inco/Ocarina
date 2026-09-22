import { supabase } from '../lib/supabase';

export function getPastelColor(username = '') {
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = username.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 85%)`;
}

export async function signInWithSpotify() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      redirectTo: window.location.origin,
      scopes: 'user-read-currently-playing user-read-playback-state user-modify-playback-state user-read-private',
    },
  });
}

export async function signInAsGuest() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase.auth.signInAnonymously();
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function getFriendDashboard(userId) {
  const { data, error } = await supabase
    .from('friendships')
    .select('friend_id, status, friend:friend_id (id, username, avatar_url)')
    .eq('user_id', userId)
    .eq('status', 'ACCEPTED');
  if (error) throw error;

  const friendIds = (data || []).map((friendship) => friendship.friend_id);
  if (!friendIds.length) return [];

  const { data: rooms, error: roomError } = await supabase
    .from('rooms')
    .select('id, host_id, room_code, current_track, updated_at')
    .in('host_id', friendIds)
    .eq('is_active', true);
  if (roomError) throw roomError;

  return (data || []).map((friendship) => ({
    ...friendship.friend,
    room: (rooms || []).find((room) => room.host_id === friendship.friend_id) || null,
    color: getPastelColor(friendship.friend.username),
  }));
}

export async function getSentRecommendations(userId) {
  const { data, error } = await supabase
    .from('track_drops')
    .select('id, spotify_uri, title, artist, album_art, created_at, receiver:receiver_id (id, username, avatar_url)')
    .eq('sender_id', userId)
    .not('receiver_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return Object.values((data || []).reduce((groups, drop) => {
    const friendId = drop.receiver.id;
    if (!groups[friendId]) groups[friendId] = { friend: drop.receiver, color: getPastelColor(drop.receiver.username), songs: [] };
    groups[friendId].songs.push(drop);
    return groups;
  }, {}));
}

export async function createListenerRoom(userId, roomCode, currentTrack = {}) {
  const { data, error } = await supabase.from('rooms').upsert({
    host_id: userId,
    room_code: roomCode,
    is_active: true,
    current_track: currentTrack,
    last_ping_at: new Date().toISOString(),
  }, { onConflict: 'host_id' }).select().single();
  if (error) throw error;
  return data;
}

export async function getRoomByCode(roomCode) {
  const { data, error } = await supabase.from('rooms').select('*').eq('room_code', roomCode.toUpperCase()).eq('is_active', true).single();
  if (error) throw error;
  return data;
}

export async function getRoomForHost(hostId) {
  const { data, error } = await supabase.from('rooms').select('*').eq('host_id', hostId).eq('is_active', true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRoomQueue(roomId) {
  const { data, error } = await supabase.from('track_drops').select('*, sender:sender_id (id, username)').eq('room_id', roomId).eq('status', 'QUEUED').order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addTrackDrop({ roomId, senderId, receiverId, track }) {
  const { data, error } = await supabase.from('track_drops').insert({
    room_id: roomId,
    sender_id: senderId,
    receiver_id: receiverId,
    spotify_uri: track.uri,
    title: track.title,
    artist: track.artist,
    album_art: track.albumArt,
  }).select().single();
  if (error) throw error;
  return data;
}

export function subscribeToRoom(roomId, onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'track_drops', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function getSpotifyPlayback(providerToken) {
  if (!providerToken) throw new Error('Spotify playback permission is not available. Sign in with Spotify again.');
  const headers = { Authorization: `Bearer ${providerToken}` };
  const [playbackResponse, queueResponse] = await Promise.all([
    fetch('https://api.spotify.com/v1/me/player', { headers }),
    fetch('https://api.spotify.com/v1/me/player/queue', { headers }),
  ]);
  if (playbackResponse.status === 204) return { currentlyPlaying: null, spotifyQueue: [] };
  if (!playbackResponse.ok || !queueResponse.ok) throw new Error('Spotify playback is unavailable. Open Spotify and start a player.');
  const playback = await playbackResponse.json();
  const queue = await queueResponse.json();
  const item = playback.item;
  return {
    currentlyPlaying: item ? {
      id: item.id,
      uri: item.uri,
      title: item.name,
      artist: item.artists.map((artist) => artist.name).join(', '),
      albumArt: item.album?.images?.[0]?.url || '',
      progressMs: playback.progress_ms,
      durationMs: item.duration_ms,
      isPlaying: playback.is_playing,
    } : null,
    spotifyQueue: (queue.queue || []).slice(0, 10).map((item) => ({
      id: item.id,
      uri: item.uri,
      title: item.name,
      artist: item.artists.map((artist) => artist.name).join(', '),
      albumArt: item.album?.images?.[0]?.url || '',
      durationMs: item.duration_ms,
    })),
  };
}

export async function updateRoomPlayback(roomId, playback) {
  const { data, error } = await supabase.from('rooms').update({
    current_track: playback.currentlyPlaying || {},
    updated_at: new Date().toISOString(),
  }).eq('id', roomId).select().single();
  if (error) throw error;
  return data;
}
