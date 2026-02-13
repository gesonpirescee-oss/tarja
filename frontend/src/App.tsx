import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentReviewPage from './pages/DocumentReviewPage';
import AuditPage from './pages/AuditPage';
import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/:id" element={<DocumentReviewPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
      </Routes>
    </Box>
  );
}

export default App;
