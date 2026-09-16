import './globals.css';
import { Inter } from "next/font/google";
import { cookies, headers } from 'next/headers';
import { getLocaleConfig } from '@/lib/locales';
import ChunkSelfHealing from '@/components/ChunkSelfHealing';
import GlobalSiteBanner from '@/components/GlobalSiteBanner';
import MaintenanceGate from '@/components/MaintenanceGate';
import { getSettingByKey } from '@/lib/repositories/settings';
import { getUserBySession } from '@/lib/billing';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata = {
  title: 'Open Generative AI — Free AI Image & Video Studio',
  description: 'Generate AI images and videos using 200+ models — Flux, Midjourney, Kling, Veo, Seedance and more.',
};

export default async function RootLayout({ children }) {
  // Locale is derived from the URL path by middleware.js and passed
  // through as a plain response header — the root layout is shared by
  // every locale's route tree, so it can't take a `locale` prop directly.
  const headerList = await headers();
  const { htmlLang } = getLocaleConfig(headerList.get('x-locale'));

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ko_session')?.value;
  const user = getUserBySession(sessionToken);

  let banner = null;
  let maintenance = null;
  try {
    banner = getSettingByKey('site_banner')?.value || null;
    maintenance = getSettingByKey('maintenance_mode')?.value || null;
  } catch {}

  return (
    <html lang={htmlLang}>
      <body className={inter.variable}>
        <ChunkSelfHealing />
        <GlobalSiteBanner banner={banner} />
        <MaintenanceGate maintenance={maintenance} user={user}>
          {children}
        </MaintenanceGate>
      </body>
    </html>
  );
}
