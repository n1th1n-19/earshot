// Verifies LiveKit credentials by making a real authenticated API call.
// Prints no secrets.
import { RoomServiceClient } from 'livekit-server-sdk';

const clean = (s) => (s ?? '').replace(/^["']|["']$/g, '');
const url = clean(process.env.NEXT_PUBLIC_LIVEKIT_URL);
const key = clean(process.env.LIVEKIT_API_KEY);
const secret = clean(process.env.LIVEKIT_API_SECRET);

if (!url || !key || !secret) { console.log('livekit env incomplete'); process.exit(1); }
console.log('host        :', new URL(url.replace(/^wss:/, 'https:')).hostname);

try {
  const svc = new RoomServiceClient(url.replace(/^wss:\/\//, 'https://'), key, secret);
  const rooms = await svc.listRooms();
  console.log('authenticated: yes');
  console.log('active rooms :', rooms.length);
} catch (e) {
  console.log('authenticated: NO');
  console.log('error        :', e.status ?? e.code ?? e.name ?? 'unknown');
  process.exit(1);
}
