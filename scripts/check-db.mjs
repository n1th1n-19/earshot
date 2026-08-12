// Connectivity check. Prints only booleans and non-secret metadata —
// never the connection string, and never an error message that could embed it.
import postgres from 'postgres';

const raw = (process.env.DATABASE_URL ?? '').replace(/^["']|["']$/g, '');
if (!raw) { console.log('DATABASE_URL missing'); process.exit(1); }

try {
  const sql = postgres(raw, { prepare: false, connect_timeout: 15 });
  const [v] = await sql`select version()`;
  console.log('connected   : yes');
  console.log('server      :', v.version.split(' ').slice(0, 2).join(' '));
  const t = await sql`select tablename from pg_tables where schemaname='public' order by 1`;
  console.log('tables      :', t.length ? t.map(r => r.tablename).join(', ') : '(none yet)');
  await sql.end();
} catch (e) {
  console.log('connected   : NO');
  console.log('error code  :', e.code ?? e.name ?? 'unknown');
  process.exit(1);
}
