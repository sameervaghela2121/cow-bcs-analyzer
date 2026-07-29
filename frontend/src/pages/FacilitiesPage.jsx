import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useScopedNavigate } from '../auth/useScopedNavigate.js';
import { facilitiesApi } from '../api/facilities.js';
import { Button, PageHeader, TextInput } from '../components/ui/index.js';
import { color, radius, shadow, transition, font } from '../styles/tokens.js';

const cardShellStyle = {
  background: color.bgCard,
  border: `1px solid ${color.borderCard}`,
  borderRadius: radius.card,
  boxShadow: shadow.card,
  transition,
};

// Org-Admin's landing page (their own organization is already fixed, so
// there's no Organizations step) and super_admin's second drill-down step
// (after picking an organization). Clicking a facility sets the view scope
// and enters the regular app content, exactly as if you were a Facility-
// Admin/Staff member fixed to that one facility.
//
// Only super_admin gets the "Add a facility" form - facility setup is the
// platform admin's job, same as creating the organization itself; an
// Org-Admin only ever picks among facilities super_admin has already set up.
export default function FacilitiesPage() {
  const { orgId } = useParams();
  const { membership, isSuperAdmin, setViewScope, viewScope } = useAuth();
  const navigate = useScopedNavigate();
  const [facilities, setFacilities] = useState(null);
  const [error, setError] = useState(null);

  const [newFacilityName, setNewFacilityName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const organizationId = orgId || membership?.organizationId;

  function refetch() {
    return facilitiesApi.list(orgId).then(setFacilities).catch(() => setError('Could not load facilities.'));
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  function pick(facilityId) {
    setViewScope({ organizationId, facilityId });
    // Pass the just-picked scope explicitly rather than relying on
    // useScopedNavigate's own (still-stale, pre-render) viewScope closure.
    navigate('/dashboard', { state: { organizationId, facilityId } });
  }

  async function createFacility(e) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await facilitiesApi.create({ organizationId, name: newFacilityName });
      setNewFacilityName('');
      await refetch();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Could not create facility.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 28px 60px' }}>
      <PageHeader title="Facilities" subtitle="Pick a facility to view its herd, uploads, and reviews." />

      {isSuperAdmin && (
        <form onSubmit={createFacility} style={{ ...cardShellStyle, padding: 24, marginBottom: 28 }}>
          <div style={{ fontSize: font.size.cardTitle, fontWeight: font.weight.semibold, color: color.textPrimary, marginBottom: 16 }}>
            Add a facility
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label htmlFor="new-facility-name" style={{ display: 'none' }}>Facility name</label>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <MapPin size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
              <TextInput
                id="new-facility-name" placeholder="Facility name" value={newFacilityName} onChange={(e) => setNewFacilityName(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
            </div>
            <Button type="submit" icon={Plus} disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
          {createError && (
            <div style={{ background: '#FDECEC', color: color.danger, fontSize: 13, padding: '9px 12px', borderRadius: radius.sm, marginTop: 14 }}>
              {createError}
            </div>
          )}
        </form>
      )}

      {error && (
        <div style={{ background: '#FDECEC', color: color.danger, fontSize: 13, padding: '9px 12px', borderRadius: radius.sm, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {facilities?.map((facility) => (
          <button
            key={facility.id}
            onClick={() => pick(facility.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
              padding: '14px 18px', borderRadius: radius.card,
              border: `1px solid ${facility.id === viewScope.facilityId ? color.primary : color.borderCard}`,
              background: color.bgCard, boxShadow: shadow.card, cursor: 'pointer', transition,
            }}
          >
            <MapPin size={20} color={color.textMuted} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary }}>{facility.name}</div>
          </button>
        ))}
        {facilities?.length === 0 && (
          <div style={{ fontSize: 13.5, color: color.textSecondary }}>No facilities yet.</div>
        )}
      </div>
    </div>
  );
}
