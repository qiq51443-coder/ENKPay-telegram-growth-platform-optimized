import React, { useState, useEffect } from 'react';
import { LoadingScreen } from './components/LoadingScreen';
import { BottomNav } from './components/BottomNav';
import { Trading } from './pages/Trading';
import { Products } from './pages/Products';
import { Charity } from './pages/Charity';
import { Profile } from './pages/Profile';
import { useTelegram } from './hooks/useTelegram';
import { theme } from './theme';

type TabKey = 'trading' | 'products' | 'charity' | 'profile';

function App() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('trading');
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

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'trading': return <Trading />;
      case 'products': return <Products />;
      case 'charity': return <Charity />;
      case 'profile': return <Profile />;
      default: return <Trading />;
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bgPrimary, paddingBottom: '60px' }}>
      {renderPage()}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default App;
