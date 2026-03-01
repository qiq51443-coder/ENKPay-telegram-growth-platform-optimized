import React, { useState, useEffect } from 'react';
import { LoadingScreen } from './components/LoadingScreen';
import { BottomNav, TabKey } from './components/BottomNav';
import { AnnouncementModal } from './components/AnnouncementModal';
import { Trading } from './pages/Trading';
import { Auction } from './pages/Auction';
import { Products } from './pages/Products';
import { Charity } from './pages/Charity';
import { Profile } from './pages/Profile';
import { useTelegram } from './hooks/useTelegram';
import { theme } from './theme';
import { getAnnouncements } from './services/api';

function App() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('trading');
  const [announcement, setAnnouncement] = useState<{ title: string; content: string; images?: string[] } | null>(null);
  const { tg } = useTelegram();

  useEffect(() => {
    tg?.expand();
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setLoading(false), 200);
          return 100;
        }
        return prev + 10;
      });
    }, 80);
    return () => clearInterval(interval);
  // tg is stable after initial mount; expand only needs to be called once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show announcement after loading
  useEffect(() => {
    if (!loading) {
      getAnnouncements(true).then(data => {
        const items = data?.data || [];
        if (items.length > 0) {
          setAnnouncement({
            title: items[0].title,
            content: items[0].content,
            images: items[0].images,
          });
        }
      }).catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'trading': return <Trading />;
      case 'auction': return <Auction />;
      case 'products': return <Products />;
      case 'charity': return <Charity />;
      case 'profile': return <Profile />;
      default: return <Trading />;
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bgPrimary, paddingBottom: '60px' }}>
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

export default App;
