import { redirect } from 'next/navigation';

/**
 * Legacy deep link. Agent data is now rendered inside the Studio shell so
 * authentication and provider credentials stay on the internal proxy path.
 */
export default async function AgentPage({ params }) {
  const { agent_id } = await params;
  redirect(`/studio/agents/${encodeURIComponent(agent_id)}`);
}
