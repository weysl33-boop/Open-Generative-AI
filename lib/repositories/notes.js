import 'server-only';

import { execute, nowIso, queryMany, randomId } from '../db/index.js';

export function listNotes(targetType, targetId) {
  return queryMany(`
    SELECT id, target_type, target_id, body, author_id, author_email, created_at
    FROM admin_notes WHERE target_type = $1 AND target_id = $2 ORDER BY created_at DESC
  `, [targetType, String(targetId)]);
}

export async function addNote({ targetType, targetId, body, authorId, authorEmail }) {
  const id = randomId('note');
  const cleanBody = body.trim();
  const now = nowIso();
  await execute(`INSERT INTO admin_notes (id, target_type, target_id, body, author_id, author_email, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, targetType, String(targetId), cleanBody, authorId, authorEmail, now]);
  return { id, targetType, targetId, body: cleanBody, authorId, authorEmail, createdAt: now };
}
