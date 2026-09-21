import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Agents — koyosim',
};

export default function AgentsPage() {
  redirect('/studio/agents');
}
