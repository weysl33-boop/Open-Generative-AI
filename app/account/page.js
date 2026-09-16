import AccountClient from './AccountClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '账户与订阅 | KoyoSIM AI Studio',
  description: '管理 KoyoSIM AI Studio 账户与生成额度。',
};

export default function AccountPage() {
  return <AccountClient />;
}
