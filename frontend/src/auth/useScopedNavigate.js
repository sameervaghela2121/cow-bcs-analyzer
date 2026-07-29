import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// A drop-in replacement for react-router's useNavigate() for any push into
// the facility-scoped app content (Upload/Herd/Review/Audit/Dashboard).
// Attaches the view scope active *right now* to the history entry being
// created, so that pressing back later restores that facility's data
// instead of whatever facility happens to be selected at the time - see
// AuthContext's location-state sync, which reads this back out on every
// route change.
export function useScopedNavigate() {
  const navigate = useNavigate();
  const { viewScope } = useAuth();
  return (to, options = {}) => navigate(to, { ...options, state: { ...viewScope, ...options.state } });
}
