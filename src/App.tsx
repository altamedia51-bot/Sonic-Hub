import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider } from './context/PlayerContext';
import { Navbar } from './components/Navbar';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { AuthModal } from './components/AuthModal';
import { StudioPage } from './pages/StudioPage';
import { LibraryPage } from './pages/LibraryPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { DemoPage } from './pages/DemoPage';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<'studio' | 'library' | 'dashboard' | 'admin' | 'demo'>('studio');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { isAdmin } = useAuth();

  // If unauthorized user somehow selects admin, fallback to studio
  useEffect(() => {
    if (currentTab === 'admin' && !isAdmin) {
      setCurrentTab('studio');
    }
  }, [currentTab, isAdmin]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      
      {/* Navigation Bar */}
      <Navbar 
        currentTab={currentTab} 
        setCurrentTab={(tab) => {
          if (tab === 'admin' && !isAdmin) {
            return;
          }
          setCurrentTab(tab as any);
        }} 
        openAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentTab === 'studio' && (
          <StudioPage onGoToAdmin={() => setCurrentTab('admin')} />
        )}
        {currentTab === 'library' && (
          <LibraryPage onOpenStudio={() => setCurrentTab('studio')} />
        )}
        {currentTab === 'dashboard' && (
          <DashboardPage onOpenStudio={() => setCurrentTab('studio')} />
        )}
        {currentTab === 'admin' && (
          isAdmin ? <AdminPage /> : <StudioPage onGoToAdmin={() => setCurrentTab('admin')} />
        )}
        {currentTab === 'demo' && (
          <DemoPage onGoToStudio={() => setCurrentTab('studio')} />
        )}
      </main>

      {/* Global Audio Player Bar */}
      <AudioPlayerBar />

      {/* Authentication Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <AppContent />
      </PlayerProvider>
    </AuthProvider>
  );
}
