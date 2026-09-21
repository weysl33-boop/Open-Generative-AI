import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { dailyCheckIn } from '../../../../../lib/financial/index.js';
import { getApiI18n } from '../../../../../lib/i18n.js';
import { guardMutation } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const { t } = getApiI18n(request);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: t('api.unauthorized') }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const result = await dailyCheckIn(user.id);
    return json({
      ...result,
      message: t('financial.checkinSuccess'),
    });
  } catch (error) {
    console.error('[api/financial/credits/checkin]', error);
    return json({ error: publicErrorMessage(error, t('common.failed')) }, { status: 400 });
  }
}
