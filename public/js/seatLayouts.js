// Percentage-based (left%, top%) coordinates for where each seat's name
// badge sits on top of the supplied room template photos. Derived from the
// supplied reference images. These are approximate — nudge the numbers
// below if you want pixel-perfect alignment with your exact exported
// images; everything else in the app is unaffected by this file.

export const ROOM_IMAGES = {
  3: '/assets/rooms/room-3.jpg',
  4: '/assets/rooms/room-4.jpg',
  5: '/assets/rooms/room-5.jpg',
  6: '/assets/rooms/room-6.jpg',
  7: '/assets/rooms/room-7.jpg',
  8: '/assets/rooms/room-8.jpg',
  9: '/assets/rooms/room-9.jpg',
  10: '/assets/rooms/room-10.jpg',
};

// Each array is ordered by seat index (0-based) matching join order.
export const SEAT_LAYOUTS = {
  3: [
    { x: 50.3, y: 34.0 },
    { x: 21.1, y: 52.3 },
    { x: 82.5, y: 48.0 },
  ],
  4: [
    { x: 49.3, y: 32.0 },
    { x: 20.0, y: 52.0 },
    { x: 78.0, y: 46.0 },
    { x: 70.0, y: 77.0 },
  ],
  5: [
    { x: 39.0, y: 31.4 },
    { x: 60.8, y: 33.1 },
    { x: 19.2, y: 45.0 },
    { x: 82.0, y: 47.0 },
    { x: 49.5, y: 71.0 },
  ],
  6: [
    { x: 41.4, y: 34.6 },
    { x: 61.5, y: 34.7 },
    { x: 19.1, y: 50.0 },
    { x: 84.4, y: 49.5 },
    { x: 23.0, y: 67.0 },
    { x: 84.0, y: 66.0 },
  ],
  7: [
    { x: 50.0, y: 31.0 },
    { x: 23.0, y: 39.0 },
    { x: 78.0, y: 41.0 },
    { x: 14.0, y: 53.0 },
    { x: 87.0, y: 57.0 },
    { x: 35.0, y: 74.0 },
    { x: 68.0, y: 74.0 },
  ],
  8: [
    { x: 41.0, y: 37.0 },
    { x: 59.3, y: 37.1 },
    { x: 80.5, y: 42.3 },
    { x: 85.0, y: 57.0 },
    { x: 81.5, y: 75.3 },
    { x: 27.0, y: 75.0 },
    { x: 11.8, y: 57.1 },
    { x: 16.6, y: 42.4 },
  ],
  9: [
    { x: 36.0, y: 31.0 },
    { x: 50.0, y: 30.0 },
    { x: 64.7, y: 32.6 },
    { x: 86.0, y: 42.0 },
    { x: 78.0, y: 63.0 },
    { x: 49.0, y: 73.0 },
    { x: 23.0, y: 60.0 },
    { x: 14.0, y: 41.0 },
    { x: 22.0, y: 27.0 },
  ],
  10: [
    { x: 27.0, y: 34.0 },
    { x: 39.0, y: 31.0 },
    { x: 50.0, y: 30.0 },
    { x: 61.0, y: 31.0 },
    { x: 73.0, y: 34.0 },
    { x: 84.0, y: 45.0 },
    { x: 84.0, y: 68.0 },
    { x: 25.0, y: 71.0 },
    { x: 13.0, y: 52.0 },
    { x: 17.0, y: 38.0 },
  ],
};

/** Generic circular fallback for any player count with no template photo. */
export function generateFallbackLayout(n) {
  const layout = [];
  const cx = 50, cy = 52, rx = 38, ry = 34;
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    layout.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return layout;
}

export function getRoomImage(maxPlayers) {
  return ROOM_IMAGES[maxPlayers] || null;
}

export function getSeatLayout(maxPlayers) {
  return SEAT_LAYOUTS[maxPlayers] || generateFallbackLayout(maxPlayers);
}
