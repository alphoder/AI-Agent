'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error.message
    ? error.message.length > 200
      ? error.message.slice(0, 200) + '...'
      : error.message
    : 'An unexpected error occurred.';

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#09090b',
          color: '#fafafa',
          padding: '16px',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            backgroundColor: 'rgba(239,68,68,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <h1 style={{ marginTop: 20, fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 14,
            color: '#a1a1aa',
            textAlign: 'center',
            maxWidth: 400,
          }}
        >
          {message}
        </p>
        <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
          <button
            onClick={reset}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: '#3b82f6',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
          <a
            href="/dashboard"
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 6,
              border: '1px solid #27272a',
              backgroundColor: 'transparent',
              color: '#fafafa',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Go to Dashboard
          </a>
        </div>
      </body>
    </html>
  );
}
