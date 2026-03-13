import { useState, useEffect } from 'react';
import { LoadingScreen } from './components/LoadingScreen';
import { BottomNav } from './components/BottomNav';
import { AnnouncementModal } from './components/AnnouncementModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Trading } from './pages/Trading';
import { Auction } from './pages/Auction';
import { Products } from './pages/Products';
import { Charity } from './pages/Charity';
import { Profile } from './pages/Profile';
import { useTelegram } from './hooks/useTelegram';
import { theme } from './theme';
import { getAnnouncements, setInitData as setApiInitData } from './services/api';
import { LanguageProvider, useLang } from './context/LanguageContext';

type TabKey = 'trading' | 'auction' | 'products' | 'charity' | 'profile';

interface Announcement {
  id: string;
  title: string;
  content: string;
  images?: string[];
}

function AppContent() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('trading');
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const { tg, initData } = useTelegram();
  const { lang } = useLang();

  useEffect(() => {
    if (initData) {
      setApiInitData(initData);
    }
  }, [initData]);

  useEffect(() => {
    tg?.expand();
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setLoading(false);
            // Fetch launch announcements after loading completes
            getAnnouncements(true)
              .then(data => {
                const list: Announcement[] = data?.announcements || data?.data || [];
                if (list.length > 0) setAnnouncement(list[0]);
              })
              .catch(() => {/* non-critical */});
          }, 200);
          return 100;
        }
        return prev + 10;
      });
    }, 80);
    return () => clearInterval(interval);
  // tg is stable after initial mount; expand only needs to be called once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'trading': return <ErrorBoundary><Trading /></ErrorBoundary>;
      case 'auction': return <ErrorBoundary><Auction /></ErrorBoundary>;
      case 'products': return <ErrorBoundary><Products /></ErrorBoundary>;
      case 'charity': return <ErrorBoundary><Charity /></ErrorBoundary>;
      case 'profile': return <ErrorBoundary><Profile /></ErrorBoundary>;
      default: return <ErrorBoundary><Trading /></ErrorBoundary>;
    }
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      style={{ minHeight: '100vh', backgroundColor: theme.bgPrimary, paddingBottom: '60px' }}
    >
      {announcement && (
        <AnnouncementModal
          title={announcement.title}
          content={announcement.content}
          images={announcement.images}
          onClose={() => setAnnouncement(null)}
        />
      )}
      {renderPage()}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;
