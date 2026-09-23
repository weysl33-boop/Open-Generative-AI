/**
 * Seed script for community cases.
 * Ensures creators exist in auth_usr.users, then seeds BUILTIN_COMMUNITY_CASES into ai_studio.community_posts.
 */
import { BUILTIN_COMMUNITY_CASES } from '../lib/community/builtinCases.js';
import { query, withTransaction } from '../lib/db/pg.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';

export async function seedCommunityCases() {
  await assertSandboxDatabase();
  console.log(`[seed-community-cases] Starting seed for ${BUILTIN_COMMUNITY_CASES.length} cases...`);

  await withTransaction(async (tx) => {
    // 1. Ensure creator users exist in auth_usr.users
    const creators = new Map();
    for (const c of BUILTIN_COMMUNITY_CASES) {
      if (!creators.has(c.user_id)) {
        creators.set(c.user_id, {
          id: c.user_id,
          displayName: c.author_name,
          avatarUrl: c.author_avatar,
          username: c.author_username,
          bio: c.author_bio || '',
        });
      }
    }

    for (const [, creator] of creators) {
      await tx.execute(
        `
        INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
        VALUES ($1, $2, $3, 'creator', $4, now(), now())
        ON CONFLICT (id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            bio = EXCLUDED.bio,
            updated_at = now()
      `,
        [creator.id, creator.displayName, creator.avatarUrl, creator.bio]
      );
    }

    // 2. Insert or update community_posts
    for (const item of BUILTIN_COMMUNITY_CASES) {
      await tx.execute(
        `
        INSERT INTO ai_studio.community_posts (
          id, creation_id, user_id, title, description,
          media_type, media_url, cover_url, prompt, negative_prompt,
          model_name, parameters, tags, likes_count, coins_count,
          views_count, remix_count, comments_count, status, is_featured,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, now()
        )
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            media_type = EXCLUDED.media_type,
            media_url = EXCLUDED.media_url,
            cover_url = EXCLUDED.cover_url,
            prompt = EXCLUDED.prompt,
            negative_prompt = EXCLUDED.negative_prompt,
            model_name = EXCLUDED.model_name,
            parameters = EXCLUDED.parameters,
            tags = EXCLUDED.tags,
            likes_count = EXCLUDED.likes_count,
            coins_count = EXCLUDED.coins_count,
            views_count = EXCLUDED.views_count,
            remix_count = EXCLUDED.remix_count,
            comments_count = EXCLUDED.comments_count,
            is_featured = EXCLUDED.is_featured,
            updated_at = now()
      `,
        [
          item.id,
          item.creation_id || null,
          item.user_id,
          item.title,
          item.description || '',
          item.media_type,
          item.media_url,
          item.cover_url,
          item.prompt,
          item.negative_prompt || '',
          item.model_name,
          JSON.stringify(item.parameters || {}),
          item.tags,
          item.likes_count || 0,
          item.coins_count || 0,
          item.views_count || 0,
          item.remix_count || 0,
          item.comments_count || 0,
          item.status || 'published',
          item.is_featured || false,
          item.created_at || new Date().toISOString(),
        ]
      );
    }
  });

  const countRes = await query('SELECT count(*) FROM ai_studio.community_posts');
  console.log(`[seed-community-cases] Completed! Total posts in DB: ${countRes.rows[0].count}`);
}

// Allow direct execution
if (process.argv[1]?.endsWith('seed-community-cases.mjs')) {
  seedCommunityCases()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-community-cases] Failed:', err);
      process.exit(1);
    });
}
