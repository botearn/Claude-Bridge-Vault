import './globals.css';
import { LangProvider } from '@/components/LangContext';
import { Sidebar, SidebarOffset } from '@/components/Sidebar';

export const metadata = {
  title: 'Token Bank',
  description: 'Nicole API Refinery',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LangProvider>
          <Sidebar />
          <SidebarOffset>{children}</SidebarOffset>
        </LangProvider>
      </body>
    </html>
  );
}
