/**
 * Legacy layout for /agents/* redirects. Agent rendering lives in the Studio
 * shell; this subtree must not mount a provider-backed standalone client.
 */
export const metadata = {
  title: "Agent Chat — koyosim",
};

export default function AgentsLayout({ children }) {
  return (
    <div className="h-screen w-full overflow-hidden bg-canvas">
      {children}
    </div>
  );
}
