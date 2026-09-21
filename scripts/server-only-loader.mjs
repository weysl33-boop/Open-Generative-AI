// Node-only test/maintenance loader. Next.js still enforces `server-only`
// during application bundling; this loader only makes server modules callable
// from isolated Node test and migration processes.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return nextResolve(specifier, context);
}

