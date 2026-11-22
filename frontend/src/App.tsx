import { Component, Suspense, lazy } from "react";
import type { ReactNode } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { UploadProvider } from "./context/UploadContext";
import { AuthProvider } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Loader2 } from "lucide-react";
import { LocaleProvider } from "./context/LocaleProvider";
import { preloadEditor, resetEditorModule } from "./editorRoute";

const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Settings = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Settings })),
);
const Profile = lazy(() =>
  import("./pages/Profile").then((m) => ({ default: m.Profile })),
);
const Admin = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Admin })),
);
const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const Register = lazy(() =>
  import("./pages/Register").then((m) => ({ default: m.Register })),
);
const PasswordResetRequest = lazy(() =>
  import("./pages/PasswordResetRequest").then((m) => ({
    default: m.PasswordResetRequest,
  })),
);
const PasswordResetConfirm = lazy(() =>
  import("./pages/PasswordResetConfirm").then((m) => ({
    default: m.PasswordResetConfirm,
  })),
);
const AuthSetupChoice = lazy(() =>
  import("./pages/AuthSetupChoice").then((m) => ({
    default: m.AuthSetupChoice,
  })),
);

const PageLoader = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
  </div>
);

// A rejected React.lazy component stays rejected, so a retry needs a new one.
let Editor = lazy(preloadEditor);

class EditorLoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Failed to load the editor", error);
  }

  retry = () => {
    resetEditorModule();
    Editor = lazy(preloadEditor);
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col items-center justify-center gap-4 px-6"
        role="alert"
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Unable to load the editor
        </h2>
        <button
          type="button"
          onClick={this.retry}
          className="ui-button-secondary px-4"
        >
          Retry
        </button>
      </div>
    );
  }
}

const EditorRoute = () => {
  const { pathname } = useLocation();
  return (
    <EditorLoadBoundary key={pathname}>
      <EditorRouteContent />
    </EditorLoadBoundary>
  );
};

const EditorRouteContent = () => {
  const { state } = useLocation();
  const drawingName =
    typeof state?.drawingName === "string" ? state.drawingName : null;
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col items-center justify-center gap-3"
          role="status"
          aria-label="Opening drawing"
        >
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          {drawingName && <span className="text-sm">{drawingName}</span>}
        </div>
      }
    >
      <Editor />
    </Suspense>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <PreferencesProvider>
          <LocaleProvider>
            <ThemeProvider>
              <UploadProvider>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route
                      path="/reset-password"
                      element={<PasswordResetRequest />}
                    />
                    <Route
                      path="/reset-password-confirm"
                      element={<PasswordResetConfirm />}
                    />
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
                          <EditorRoute />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/shared/:id" element={<EditorRoute />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </UploadProvider>
            </ThemeProvider>
          </LocaleProvider>
        </PreferencesProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
