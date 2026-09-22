// Ocean/roomManager.js
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function createRoom(tokens) {
  const code = generateRoomCode();
  const room = {
    code,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    guests: new Map(), // socketId -> guestName
    customQueue: [],   // Array of { track, addedBy, votes, id }
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code?.toUpperCase());
}

function addTrackToRoomQueue(room, track, guestName) {
  const queueItem = {
    id: `${track.id}-${Date.now()}`,
    track,
    addedBy: guestName,
    votes: 0,
    voters: new Set(),
    addedAt: Date.now(),
  };
  room.customQueue.push(queueItem);
  return queueItem;
}

function voteTrack(room, itemId, socketId) {
  const item = room.customQueue.find((i) => i.id === itemId);
  if (!item) return false;

  if (item.voters.has(socketId)) {
    item.voters.delete(socketId);
    item.votes--;
  } else {
    item.voters.add(socketId);
    item.votes++;
  }

  // Sort queue by votes descending
  room.customQueue.sort((a, b) => b.votes - a.votes || a.addedAt - b.addedAt);
  return true;
}

module.exports = { createRoom, getRoom, addTrackToRoomQueue, voteTrack };