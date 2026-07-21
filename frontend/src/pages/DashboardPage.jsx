import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { useDashboardData } from '../hooks/useDashboardData.js';
import {
  effectiveScore, latestAnalysisPerCow, bcsDistribution, pipelineStatusCounts,
  reviewerAgreementStats, modelInfluenceStats, scoreTrend, cowsNeedingAttention, scoreVolatility, reviewBacklog,
} from '../domain/dashboardStats.js';
import { bandFor, formatScore } from '../domain/bcs.js';
import { statusLabel, statusColor } from '../domain/analysisStatus.js';
import Skeleton from '../components/Skeleton.jsx';

const card = { background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: '18px 20px' };
const cardTitle = { fontSize: 13.5, fontWeight: 700, margin: '0 0 14px' };
const PROVIDER_LABEL = {
  claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI',
  median: 'Median', mean: 'Mean', override: 'Override', unattributed: 'Unattributed',
};
const PROVIDER_COLOR = {
  claude: '#b45309', gemini: '#1d4ed8', openai: '#166534',
  median: '#6b6155', mean: '#7c3aed', override: '#9a1c1c', unattributed: '#9a9280',
};
const STATUS_LABEL_SHORT = { not_started: 'Not started', processing: 'Processing', completed: 'Completed', failed: 'Failed' };
// One representative score per band, resolved through bandFor itself so
// these colors can never drift from the ones CowDetailPage/ReviewPage use.
const BAND_COLOR = { thin: bandFor(2).color, ideal: bandFor(3).color, heavy: bandFor(4).color, unscored: bandFor(null).color };

function StatTile({ label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12.5, color: '#82796a', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9a9280' }}>{sub}</div>}
    </div>
  );
}

function DistributionChart({ distribution }) {
  const data = [
    { key: 'thin', label: 'Too thin', count: distribution.thin },
    { key: 'ideal', label: 'Ideal', count: distribution.ideal },
    { key: 'heavy', label: 'Too heavy', count: distribution.heavy },
    { key: 'unscored', label: 'Unscored', count: distribution.unscored },
  ];
  return (
    <div style={card}>
      <h3 style={cardTitle}>BCS Distribution (latest per cow)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#82796a' }} axisLine={{ stroke: '#e5e0d3' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#82796a' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [`${value} cows`, 'Count']} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((d) => <Cell key={d.key} fill={BAND_COLOR[d.key]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({ trend }) {
  return (
    <div style={card}>
      <h3 style={cardTitle}>Herd Avg BCS Trend (by week)</h3>
      {trend.length === 0 ? (
        <div style={{ fontSize: 13, color: '#82796a', padding: '40px 0', textAlign: 'center' }}>Not enough data yet.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d3" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#82796a' }} axisLine={{ stroke: '#e5e0d3' }} tickLine={false} />
            <YAxis domain={[1, 5]} tick={{ fontSize: 12, fill: '#82796a' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => [formatScore(value), 'Avg BCS']} />
            <Line type="monotone" dataKey="avgScore" stroke="#166534" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Bars are how many times each source ended up as (one of) the reviewer's
// matched candidates, out of every analysis reviewed so far - a trust
// signal, not an avg score or an API uptime number. A single review can
// land in more than one bar at once (e.g. Median picked, and Claude happened
// to agree with it) - reviewedCount is passed in explicitly rather than
// summed from the bars, since that sum can now exceed the true total.
function ProviderChart({ agreement, reviewedCount }) {
  const data = agreement.map((a) => ({ ...a, label: PROVIDER_LABEL[a.key] }));
  return (
    <div style={card}>
      <h3 style={cardTitle}>Reviewer Agreement by Source {reviewedCount > 0 && `(of ${reviewedCount} reviewed)`}</h3>
      {reviewedCount === 0 ? (
        <div style={{ fontSize: 13, color: '#82796a', padding: '40px 0', textAlign: 'center' }}>
          No reviews yet — this fills in as cows get approved/overridden.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#82796a' }} axisLine={{ stroke: '#e5e0d3' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#82796a' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value, _name, item) => [`${value} of ${reviewedCount} (${Math.round(item.payload.rate * 100)}%)`, 'Selected']}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((d) => <Cell key={d.key} fill={PROVIDER_COLOR[d.key]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <div style={{ fontSize: 11, color: '#9a9280', marginTop: 10, lineHeight: 1.4 }}>
      </div>
    </div>
  );
}

// Different question than ProviderChart: not "which candidates matched the
// reviewer's pick" but "whose number is actually the record's final score" -
// a direct pick counts immediately, and an accepted median/mean/override
// counts toward whichever single provider its value happens to match (see
// modelInfluenceStats). reviewedCount is passed in explicitly rather than
// summed, for the same reason as ProviderChart above.
function ModelInfluenceChart({ influence, reviewedCount }) {
  const data = influence.map((i) => ({ ...i, label: PROVIDER_LABEL[i.key] }));
  return (
    <div style={card}>
      <h3 style={cardTitle}>Model Influence {reviewedCount > 0 && `(of ${reviewedCount} reviewed)`}</h3>
      {reviewedCount === 0 ? (
        <div style={{ fontSize: 13, color: '#82796a', padding: '40px 0', textAlign: 'center' }}>
          No reviews yet — this fills in as cows get approved/overridden.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#82796a' }} axisLine={{ stroke: '#e5e0d3' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#82796a' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value, _name, item) => [`${value} of ${reviewedCount} (${Math.round(item.payload.rate * 100)}%)`, 'Final score from']}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((d) => <Cell key={d.key} fill={PROVIDER_COLOR[d.key]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      <div style={{ fontSize: 11, color: '#9a9280', marginTop: 10, lineHeight: 1.4 }}>
      </div>
    </div>
  );
}

function PipelineChart({ counts }) {
  const data = Object.entries(counts).map(([status, count]) => ({ status, label: STATUS_LABEL_SHORT[status], count }));
  return (
    <div style={card}>
      <h3 style={cardTitle}>Analyses by Pipeline Status</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#82796a' }} axisLine={{ stroke: '#e5e0d3' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#82796a' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [`${value} analyses`, 'Count']} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((d) => <Cell key={d.status} fill={statusColor(d.status)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AttentionList({ items, navigate }) {
  const REASON_LABEL = { thin: 'Too thin', heavy: 'Too heavy', failed: 'Latest upload failed' };
  return (
    <div style={card}>
      <h3 style={cardTitle}>Cows Needing Attention</h3>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#82796a' }}>Nothing flagged — herd looks good.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(({ cow, reason, band }) => (
            <div
              key={cow.cowsId}
              onClick={() => navigate(`/herd/${cow.cowsId}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e0d3' }}
            >
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Cow {cow.cowsId}</div>
              <span style={{
                fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999,
                color: reason === 'failed' ? '#b91c1c' : band.color,
                background: reason === 'failed' ? '#fdeaea' : band.bg,
              }}>
                {REASON_LABEL[reason]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Rapid swings between a cow's two most recent scored analyses - an
// early-warning signal, distinct from AttentionList's "where does this cow
// stand right now" snapshot. bandFor's heavy/thin colors reused for
// direction: a big gain trends toward "too heavy", a big drop toward "too
// thin", so the coloring means the same thing here as everywhere else.
function VolatilityList({ items, navigate }) {
  const gainedColor = bandFor(4).color;
  const lostColor = bandFor(2).color;
  return (
    <div style={card}>
      <h3 style={cardTitle}>Score Volatility</h3>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#82796a' }}>No significant swings — herd is stable.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(({ cow, previousScore, latestScore, delta }) => {
            const gained = delta > 0;
            const color = gained ? gainedColor : lostColor;
            return (
              <div
                key={cow.cowsId}
                onClick={() => navigate(`/herd/${cow.cowsId}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e0d3' }}
              >
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Cow {cow.cowsId}</div>
                <div style={{ fontSize: 12.5, color: '#82796a' }}>{formatScore(previousScore)} → {formatScore(latestScore)}</div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999, color, background: gained ? bandFor(4).bg : bandFor(2).bg }}>
                  {gained ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  {formatScore(Math.abs(delta))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { cows, allAnalyses, isLoading } = useDashboardData();

  const latestByCow = useMemo(() => latestAnalysisPerCow(allAnalyses), [allAnalyses]);
  const distribution = useMemo(() => bcsDistribution(latestByCow), [latestByCow]);
  const pipelineCounts = useMemo(() => pipelineStatusCounts(allAnalyses), [allAnalyses]);
  const agreement = useMemo(() => reviewerAgreementStats(allAnalyses), [allAnalyses]);
  const influence = useMemo(() => modelInfluenceStats(allAnalyses), [allAnalyses]);
  const reviewedCount = useMemo(() => allAnalyses.filter((a) => a.is_approved).length, [allAnalyses]);
  const trend = useMemo(() => scoreTrend(allAnalyses), [allAnalyses]);
  const attention = useMemo(() => cowsNeedingAttention(cows, latestByCow), [cows, latestByCow]);
  const volatility = useMemo(() => scoreVolatility(cows, allAnalyses), [cows, allAnalyses]);
  const pendingReview = useMemo(() => reviewBacklog(cows), [cows]);

  const herdAvgScore = useMemo(() => {
    const scores = [...latestByCow.values()].map(effectiveScore).filter((s) => s != null);
    if (scores.length === 0) return null;
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }, [latestByCow]);

  if (isLoading) {
    return (
      <div style={{ padding: '32px 28px 60px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Herd health and AI review activity at a glance.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 14, marginBottom: 18 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={card}>
              <Skeleton width={80} height={12.5} style={{ marginBottom: 10 }} />
              <Skeleton width={50} height={28} />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px,1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={card}>
              <Skeleton width={200} height={13.5} style={{ marginBottom: 14 }} />
              <Skeleton height={220} radius={8} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Dashboard</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Herd health and AI review activity at a glance.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 14, marginBottom: 18 }}>
        <StatTile label="Herd size" value={cows.length} />
        <StatTile label="Herd avg BCS" value={formatScore(herdAvgScore)} sub={herdAvgScore == null ? undefined : bandFor(herdAvgScore).label} />
        <StatTile label="Pending review" value={pendingReview.length} />
        <StatTile label="In pipeline" value={pipelineCounts.not_started + pipelineCounts.processing} sub="not started + processing" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px,1fr))', gap: 16 }}>
        <DistributionChart distribution={distribution} />
        <TrendChart trend={trend} />
        <ProviderChart agreement={agreement} reviewedCount={reviewedCount} />
        <ModelInfluenceChart influence={influence} reviewedCount={reviewedCount} />
        <PipelineChart counts={pipelineCounts} />
        <AttentionList items={attention} navigate={navigate} />
        <VolatilityList items={volatility} navigate={navigate} />
      </div>
    </div>
  );
}
