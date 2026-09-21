'use client';

import { Component, useEffect, useRef } from 'react';

function emitStudioMetric(studioId, event, detail = {}) {
  if (typeof window === 'undefined') return;

  const payload = {
    studioId,
    event,
    at: new Date().toISOString(),
    ...detail,
  };

  window.dispatchEvent(new CustomEvent('studio:performance', { detail: payload }));
}

export function StudioLoadingState({ label = 'Loading Studio...' }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-canvas text-ink-subtle" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-[#22d3ee]" />
        <span className="text-micro font-black uppercase tracking-[0.2em]">{label}</span>
      </div>
    </div>
  );
}

export function StudioEmptyState({ title = 'Nothing here yet', description = 'There is no content to show in this section.' }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-canvas px-6 text-center">
      <div>
        <h2 className="text-sm font-semibold text-ink-muted">{title}</h2>
        <p className="mt-2 max-w-md text-xs text-ink-subtle">{description}</p>
      </div>
    </div>
  );
}

export function StudioFailureState({ error, onRetry }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-canvas px-6 text-center" role="alert">
      <div className="max-w-md">
        <h2 className="text-sm font-semibold text-danger">Studio failed to load</h2>
        <p className="mt-2 text-xs text-ink-subtle">{error?.message || 'Please try again.'}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-5 rounded-lg bg-brand px-4 py-2 text-xs font-bold text-ink-on-accent">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

class StudioErrorBoundaryImpl extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    emitStudioMetric(this.props.studioId, 'error', {
      message: error?.message || 'Unknown studio error',
      componentStack: errorInfo?.componentStack || '',
    });
  }

  componentDidUpdate(previousProps) {
    if (previousProps.studioId !== this.props.studioId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <StudioFailureState error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

export function StudioResourceBoundary({ studioId, children }) {
  const mountedAt = useRef(null);

  useEffect(() => {
    mountedAt.current = typeof performance === 'undefined' ? Date.now() : performance.now();
    emitStudioMetric(studioId, 'mounted');

    return () => {
      const now = typeof performance === 'undefined' ? Date.now() : performance.now();
      emitStudioMetric(studioId, 'unmounted', {
        activeMs: Math.max(0, now - (mountedAt.current || now)),
      });
    };
  }, [studioId]);

  return <StudioErrorBoundaryImpl studioId={studioId}>{children}</StudioErrorBoundaryImpl>;
}
