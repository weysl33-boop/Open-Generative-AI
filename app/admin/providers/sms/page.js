import { redirect } from 'next/navigation';

export default function SmsProvidersPage() {
  redirect('/admin/login?category=sms');
}
