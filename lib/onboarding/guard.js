import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserBySession } from '../services/auth.js';

/**
 * 引导未完成的用户不能进入工作室：两步问卷是后续行为评估的基线，
 * 一旦绕过就再也补不齐。登录出口已会跳 /onboarding，这里是服务端兜底，
 * 覆盖直接输入 URL、旧书签与刷新等路径。
 */
export async function assertOnboardingComplete() {
  const token = (await cookies()).get('ko_session')?.value;
  const user = await getUserBySession(token);
  if (user && user.onboardingCompleted === false) redirect('/onboarding');
  return user;
}
