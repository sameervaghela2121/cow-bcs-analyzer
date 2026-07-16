import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/herd" replace />} />
      <Route path="/herd" element={<div>Herd placeholder</div>} />
    </Routes>
  );
}
