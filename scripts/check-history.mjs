import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT id, title, highlight_text, cta_text, is_active FROM ops_bill.banner_history ORDER BY created_at DESC");
  console.log("HISTORY_RECORDS:", JSON.stringify(res.rows, null, 2));
  await client.end();
}

main();
