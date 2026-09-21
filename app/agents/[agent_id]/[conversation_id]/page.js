import { redirect } from 'next/navigation';

/**
 * Legacy conversation deep link. Keep it on the Studio route so the request
 * uses the authenticated server proxy instead of a provider key cookie.
 */
export default async function AgentConversationPage({ params }) {
  const { agent_id, conversation_id } = await params;
  redirect(`/studio/agents/${encodeURIComponent(agent_id)}/${encodeURIComponent(conversation_id)}`);
}
