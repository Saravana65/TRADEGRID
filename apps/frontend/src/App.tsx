import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AppLayout } from './components/layout/AppLayout';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { MarketsPage } from './pages/MarketsPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { NewsPage } from './pages/NewsPage';
import { CompetitionsPage } from './pages/CompetitionsPage';
import { CompetitionDetailPage } from './pages/CompetitionDetailPage';
import { ChatPage } from './pages/ChatPage';
import { TradingTerminalPage } from './pages/TradingTerminalPage';
import { TransactionHistoryPage } from './pages/TransactionHistoryPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Guard: Only allow authenticated users
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Guard: Redirect authenticated users away from Login/Register
const PublicOnlyRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

export const App: React.FC = () => {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Authentication Pages */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />

        {/* Protected Exchange Application Pages */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="markets" element={<MarketsPage />} />
          <Route path="markets/:symbol" element={<StockDetailPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="competitions" element={<CompetitionsPage />} />
          <Route path="competitions/:id" element={<CompetitionDetailPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="trade" element={<TradingTerminalPage />} />
          <Route path="history" element={<TransactionHistoryPage />} />
          <Route path="admin" element={<AdminDashboardPage />} />
        </Route>

        {/* 404 Catch-All */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
