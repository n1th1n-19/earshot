// Creates one live room with dev-alex as host. Prints the room id only.
import postgres from 'postgres';
const sql = postgres((process.env.DATABASE_URL ?? '').replace(/^["']|["']$/g, ''), { prepare: false });
await sql`delete from room_bans`; await sql`delete from room_members`; await sql`delete from rooms`;
const [r] = await sql`
  insert into rooms (title, topics, status, speaker_policy, started_at, livekit_room)
  values ('Design critique', array['design'], 'live', 'everyone', now(), ${'lk-' + crypto.randomUUID()})
  returning id`;
await sql`insert into room_members (room_id, user_id, role, granted_by)
          values (${r.id}, 'dev-alex', 'host', 'dev-alex')`;
console.log(r.id);
await sql.end();
