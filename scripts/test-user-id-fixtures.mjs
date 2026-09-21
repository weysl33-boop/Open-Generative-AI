import crypto from 'node:crypto';

/** Reserve a unique six-digit UID in the active isolated test database. */
export async function reserveTestUserId(query) {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const id = String(crypto.randomInt(100000, 1000000));
    const result = await query(`
      INSERT INTO auth_usr.user_id_allocations (user_id, digit_length)
      VALUES ($1, 6)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    `, [id]);
    const row = result?.rows?.[0] || result;
    if (row?.user_id === id) return id;
  }
  throw new Error('Unable to reserve a test UID after 128 attempts.');
}

