import { redirect } from 'next/navigation';

export default function SocialProvidersPage() {
  redirect('/admin/login?category=social');
}
