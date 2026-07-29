import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Mail, Plus, User, UserPlus } from 'lucide-react';
import { organizationsApi } from '../api/organizations.js';
import { rolesApi } from '../api/roles.js';
import { usersApi } from '../api/users.js';
import { Button, PageHeader, TextInput } from '../components/ui/index.js';
import { color, radius, shadow, transition, font } from '../styles/tokens.js';

const cardShellStyle = {
  background: color.bgCard,
  border: `1px solid ${color.borderCard}`,
  borderRadius: radius.card,
  boxShadow: shadow.card,
  transition,
};

// super_admin's top-level nav: every organization on the platform, with the
// two things that actually onboard a new customer - create the organization
// itself, then invite its first Org-Admin. Clicking an org (rather than its
// "Add Org-Admin" action) drills into its facilities instead, then into the
// regular app content for whichever facility is picked there.
export default function OrganizationsPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);

  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [inviteTargetId, setInviteTargetId] = useState(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccessId, setInviteSuccessId] = useState(null);

  function refetch() {
    return organizationsApi.list().then(setOrganizations).catch(() => setError('Could not load organizations.'));
  }

  useEffect(() => {
    refetch();
    rolesApi.list().then(setRoles).catch(() => {});
  }, []);

  const orgAdminRole = roles.find((r) => r.name === 'Org-Admin');

  async function createOrganization(e) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await organizationsApi.create(newOrgName);
      setNewOrgName('');
      await refetch();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Could not create organization.');
    } finally {
      setCreating(false);
    }
  }

  function openInviteFor(orgId) {
    setInviteTargetId(orgId);
    setInviteName('');
    setInviteEmail('');
    setInviteError(null);
    setInviteSuccessId(null);
  }

  async function sendOrgAdminInvite(e, orgId) {
    e.preventDefault();
    setInviteError(null);
    if (!orgAdminRole) {
      setInviteError("The 'Org-Admin' role hasn't been set up yet.");
      return;
    }
    try {
      await usersApi.invite({ email: inviteEmail, name: inviteName, roleId: orgAdminRole.id, organizationId: orgId });
      setInviteTargetId(null);
      setInviteSuccessId(orgId);
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Could not send invite.');
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 28px 60px' }}>
      <PageHeader title="Organizations" subtitle="Every organization on the platform." />

      <form onSubmit={createOrganization} style={{ ...cardShellStyle, padding: 24, marginBottom: 28 }}>
        <div style={{ fontSize: font.size.cardTitle, fontWeight: font.weight.semibold, color: color.textPrimary, marginBottom: 16 }}>
          Create an organization
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="new-org-name" style={{ display: 'none' }}>Organization name</label>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Building2 size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
            <TextInput
              id="new-org-name" placeholder="Organization name" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)}
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

      {error && (
        <div style={{ background: '#FDECEC', color: color.danger, fontSize: 13, padding: '9px 12px', borderRadius: radius.sm, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {organizations?.map((org) => (
          <div key={org.id} style={{ ...cardShellStyle, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => navigate(`/organizations/${org.id}/facilities`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, textAlign: 'left',
                  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                }}
              >
                <Building2 size={20} color={color.textMuted} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 14.5, fontWeight: 600, color: color.textPrimary }}>{org.name}</div>
              </button>
              <Button
                variant="secondary"
                size="sm"
                icon={UserPlus}
                onClick={() => (inviteTargetId === org.id ? setInviteTargetId(null) : openInviteFor(org.id))}
              >
                Add Org-Admin
              </Button>
            </div>

            {inviteSuccessId === org.id && (
              <div style={{ fontSize: 12.5, color: color.textSecondary, marginTop: 10 }}>Invite sent.</div>
            )}

            {inviteTargetId === org.id && (
              <form onSubmit={(e) => sendOrgAdminInvite(e, org.id)} style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${color.borderCard}` }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label htmlFor={`invite-name-${org.id}`} style={{ display: 'none' }}>Name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
                    <TextInput
                      id={`invite-name-${org.id}`} placeholder="Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)}
                      style={{ width: 180, paddingLeft: 38 }}
                    />
                  </div>
                  <label htmlFor={`invite-email-${org.id}`} style={{ display: 'none' }}>Email</label>
                  <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Mail size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: color.textMuted, pointerEvents: 'none' }} />
                    <TextInput
                      id={`invite-email-${org.id}`} type="email" placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                      style={{ paddingLeft: 38 }}
                    />
                  </div>
                  <Button type="submit" size="sm">Send invite</Button>
                </div>
                {inviteError && (
                  <div style={{ background: '#FDECEC', color: color.danger, fontSize: 13, padding: '9px 12px', borderRadius: radius.sm, marginTop: 12 }}>
                    {inviteError}
                  </div>
                )}
              </form>
            )}
          </div>
        ))}
        {organizations?.length === 0 && (
          <div style={{ fontSize: 13.5, color: color.textSecondary }}>No organizations yet.</div>
        )}
      </div>
    </div>
  );
}
