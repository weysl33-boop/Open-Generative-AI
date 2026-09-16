import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { dailyCheckIn } from '../../../../../lib/financial/index.js';
import { getApiI18n } from '../../../../../lib/i18n.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const { t } = getApiI18n(request);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: t('api.unauthorized') }, { status: 401 });

  try {
    const result = await dailyCheckIn(user.id);
    return json({
      ...result,
      message: t('financial.checkinSuccess'),
    });
  } catch (error) {
    console.error('[api/financial/credits/checkin]', error);
    return json({ error: error.message || t('common.failed') }, { status: 400 });
  }
}
