import { redirect } from 'next/navigation';

export default async function EditAgentPage({ params }) {
  const { id } = await params;
  // Inline editing is not exposed by the current Studio Agent workbench yet;
  // keep the legacy URL inside the authenticated workbench rather than
  // mounting the old provider-backed page.
  redirect(`/studio/agents/edit/${encodeURIComponent(id)}`);
}
