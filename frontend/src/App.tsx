import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { UploadProvider } from './context/UploadContext';
import { AuthProvider } from './context/AuthContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Editor = lazy(() => import('./pages/Editor').then(m => ({ default: m.Editor })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const PasswordResetRequest = lazy(() => import('./pages/PasswordResetRequest').then(m => ({ default: m.PasswordResetRequest })));
const PasswordResetConfirm = lazy(() => import('./pages/PasswordResetConfirm').then(m => ({ default: m.PasswordResetConfirm })));
const AuthSetupChoice = lazy(() => import('./pages/AuthSetupChoice').then(m => ({ default: m.AuthSetupChoice })));

const PageLoader = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <PreferencesProvider>
          <ThemeProvider>
            <UploadProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/reset-password" element={<PasswordResetRequest />} />
                <Route path="/reset-password-confirm" element={<PasswordResetConfirm />} />
                <Route path="/auth-setup" element={<AuthSetupChoice />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/collections"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
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
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/editor/:id"
                  element={
                    <ProtectedRoute>
                      <Editor />
                    </ProtectedRoute>
                  }
                />
                <Route path="/shared/:id" element={<Editor />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            </UploadProvider>
          </ThemeProvider>
        </PreferencesProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
