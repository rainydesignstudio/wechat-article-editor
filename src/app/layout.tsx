import type { Metadata } from 'next';
import '../styles/globals.css';
import { AppProviders } from '../components/global/AppProviders';
import { AppShell } from '../components/global/AppShell';
import { EDITOR_THEME_BOOTSTRAP_SCRIPT } from '../lib/editorThemeCache';

export const metadata: Metadata = {
  title: 'Rainy 文稿台',
  description: '本地 Markdown＋HTML 公众号文稿工作台',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="group/theme" data-editor-theme-state="loading" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: EDITOR_THEME_BOOTSTRAP_SCRIPT }} /></head>
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
