import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { UserDetail } from './pages/UserDetail';
import { Bots } from './pages/Bots';
import { Bindings } from './pages/Bindings';
import { RedPackets } from './pages/RedPackets';
import { Broadcasts } from './pages/Broadcasts';
import { Screenshots } from './pages/Screenshots';
import { Exchanges } from './pages/Exchanges';
import { Tutorials } from './pages/Tutorials';
import { Withdrawals } from './pages/Withdrawals';
import { Settings } from './pages/Settings';
import { Loading } from './components/Common/Loading';

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Loading fullscreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id"
        element={
          <ProtectedRoute>
            <UserDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bots"
        element={
          <ProtectedRoute>
            <Bots />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bindings"
        element={
          <ProtectedRoute>
            <Bindings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/red-packets"
        element={
          <ProtectedRoute>
            <RedPackets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/broadcasts"
        element={
          <ProtectedRoute>
            <Broadcasts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/screenshots"
        element={
          <ProtectedRoute>
            <Screenshots />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exchanges"
        element={
          <ProtectedRoute>
            <Exchanges />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tutorials"
        element={
          <ProtectedRoute>
            <Tutorials />
          </ProtectedRoute>
        }
      />
      <Route
        path="/withdrawals"
        element={
          <ProtectedRoute>
            <Withdrawals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
