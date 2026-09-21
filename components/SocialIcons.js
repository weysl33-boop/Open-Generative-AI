'use client';

export function GoogleIcon({ className = "w-5 h-5", size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

export function XIcon({ className = "w-4 h-4", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function TikTokIcon({ className = "w-4 h-4", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.4a6.33 6.33 0 0 0-.85-.06A6.34 6.34 0 0 0 3.15 15.7a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.58a8.28 8.28 0 0 0 4.84 1.56v-3.45a4.83 4.83 0 0 1-1.08 0z"/>
    </svg>
  );
}

export function WeChatIcon({ className = "w-5 h-5", size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fill="#07C160" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.536 1.987c-.047.172.13.318.28.23l2.387-1.393a.62.62 0 0 1 .47-.058c1.02.32 2.119.5 3.268.5 4.8 0 8.69-3.287 8.69-7.341 0-4.054-3.89-7.342-8.69-7.342zm-2.457 4.542a1.09 1.09 0 1 1 0 2.18 1.09 1.09 0 0 1 0-2.18zm5.454 0a1.09 1.09 0 1 1 0 2.18 1.09 1.09 0 0 1 0-2.18z"/>
      <path fill="#07C160" d="M15.446 9.878c-3.927 0-7.11 2.684-7.11 5.996 0 1.808.956 3.435 2.454 4.536a.48.48 0 0 1 .174.544l-.438 1.624c-.039.14.106.26.229.188l1.951-1.139a.5.5 0 0 1 .385-.047c.833.262 1.732.41 2.67.41 3.927 0 7.11-2.684 7.11-5.996 0-3.312-3.183-5.996-7.11-5.996zm-2.008 3.714a.89.89 0 1 1 0 1.782.89.89 0 0 1 0-1.782zm4.457 0a.89.89 0 1 1 0 1.782.89.89 0 0 1 0-1.782z"/>
    </svg>
  );
}

export function QQIcon({ className = "w-5 h-5", size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="12.6" rx="7.1" ry="8.8" fill="#171717" />
      <ellipse cx="12" cy="14.2" rx="4.1" ry="5.3" fill="#fff" />
      <ellipse cx="9.5" cy="9" rx="1.1" ry="1.7" fill="#fff" />
      <ellipse cx="14.5" cy="9" rx="1.1" ry="1.7" fill="#fff" />
      <circle cx="9.8" cy="9.2" r=".45" fill="#171717" />
      <circle cx="14.2" cy="9.2" r=".45" fill="#171717" />
      <path d="m12 10.2 2.2 1.4H9.8l2.2-1.4Z" fill="#ff9d16" />
      <path d="M8 19.1c-1.7 1.2-2.9 2.2-2.6 2.8.4.8 2.2.3 4.1-.9m6.5-1.9c1.7 1.2 2.9 2.2 2.6 2.8-.4.8-2.2.3-4.1-.9" fill="none" stroke="#ffbd22" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5.5 13.3c-1.2 1.4-1.8 2.9-1.3 3.3.6.5 2-.7 3-2.1m11.3-1.2c1.2 1.4 1.8 2.9 1.3 3.3-.6.5-2-.7-3-2.1" fill="none" stroke="#171717" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// 抖音与 TikTok 是分离的登录提供方；此图标使用抖音配色，不复用 TikTokIcon。
export function DouyinIcon({ className = "w-5 h-5", size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14.1 2.2v11.5a4.2 4.2 0 1 1-3.4-4.1v3.5a1.1 1.1 0 1 0 .3 1.1V2.2h3.1Zm0 0c.4 2.8 2 4.5 4.9 4.9v3.2c-1.8-.2-3.5-.9-4.9-2.1V2.2Z" fill="#25F4EE" transform="translate(-1 0)" />
      <path d="M14.1 2.2v11.5a4.2 4.2 0 1 1-3.4-4.1v3.5a1.1 1.1 0 1 0 .3 1.1V2.2h3.1Zm0 0c.4 2.8 2 4.5 4.9 4.9v3.2c-1.8-.2-3.5-.9-4.9-2.1V2.2Z" fill="#FE2C55" transform="translate(1 0)" />
      <path d="M14.1 2.2v11.5a4.2 4.2 0 1 1-3.4-4.1v3.5a1.1 1.1 0 1 0 .3 1.1V2.2h3.1Zm0 0c.4 2.8 2 4.5 4.9 4.9v3.2c-1.8-.2-3.5-.9-4.9-2.1V2.2Z" fill="currentColor" />
    </svg>
  );
}

export function PhoneIcon({ className = "w-4 h-4", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
      <path d="M12 18h.01"/>
    </svg>
  );
}

export function MailIcon({ className = "w-4 h-4", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
}
