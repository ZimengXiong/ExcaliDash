import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Editor } from './pages/Editor';
import { Settings } from './pages/Settings';
import { PrivateDrawings } from './pages/PrivateDrawings';
import { ThemeProvider } from './context/ThemeContext';
import { VaultProvider } from './context/VaultContext';

function App() {
  return (
    <ThemeProvider>
      <VaultProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/collections" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/private" element={<PrivateDrawings />} />
            <Route path="/editor/:id" element={<Editor />} />
          </Routes>
        </Router>
      </VaultProvider>
    </ThemeProvider>
  );
}

export default App;
