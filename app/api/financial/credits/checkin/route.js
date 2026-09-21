import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { dailyCheckIn, getDailyCheckInHistory } from '../../../../../lib/financial/index.js';
import { getApiI18n } from '../../../../../lib/i18n.js';
import { guardMutation } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

const HISTORY_DAYS = 7;

export async function GET(request) {
  const { t } = getApiI18n(request);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: t('api.unauthorized') }, { status: 401 });

  try {
    return json(await getDailyCheckInHistory(user.id, HISTORY_DAYS));
  } catch (error) {
    console.error('[api/financial/credits/checkin GET]', error);
    return json({ error: publicErrorMessage(error, '获取签到记录失败') }, { status: 500 });
  }
}

export async function POST(request) {
  const { t } = getApiI18n(request);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: t('api.unauthorized') }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const result = await dailyCheckIn(user.id);
    const history = await getDailyCheckInHistory(user.id, HISTORY_DAYS);
    return json({
      ...result,
      ...history,
      message: t('financial.checkinSuccess'),
    });
  } catch (error) {
    console.error('[api/financial/credits/checkin]', error);
    return json({ error: publicErrorMessage(error, t('common.failed')) }, { status: 400 });
  }
}
