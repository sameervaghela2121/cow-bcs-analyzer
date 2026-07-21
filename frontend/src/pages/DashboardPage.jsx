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
import { statusColor } from '../domain/analysisStatus.js';
import Skeleton from '../components/Skeleton.jsx';
import { Card, PageHeader, StatusChip } from '../components/ui/index.js';
import { color, chart, status, font, radius, softTint } from '../styles/tokens.js';

const cardTitle = { fontSize: 15, fontWeight: font.weight.semibold, color: color.textPrimary, margin: '0 0 16px' };
const PROVIDER_LABEL = {
  claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI',
  median: 'Median', mean: 'Mean', override: 'Override', unattributed: 'Unattributed',
};
// One hue per meaning, restrained rather than a rainbow: the two AI-model
// colors sit in the purple/blue/teal family (claude gets the AI accent
// itself since it's the flagship model), mean is a deeper violet so it
// reads related to-but-distinct-from claude's AI accent, median stays
// neutral (it's arithmetic, not a model), override borrows the same amber
// "a human stepped in" language used everywhere else in the app.
const PROVIDER_COLOR = {
  claude: color.ai, gemini: chart.milk, openai: chart.water,
  median: status.neutral, mean: color.aiDeep, override: status.attention, unattributed: status.neutral,
};
const STATUS_LABEL_SHORT = { not_started: 'Not started', processing: 'Processing', completed: 'Completed', failed: 'Failed' };
// One representative score per band, resolved through bandFor itself so
// these colors can never drift from the ones CowDetailPage/ReviewPage use.
const BAND_COLOR = { thin: bandFor(2).color, ideal: bandFor(3).color, heavy: bandFor(4).color, unscored: bandFor(null).color };

const axisTick = { fontSize: 12, fill: chart.axis };

function StatTile({ label, value, sub }) {
  return (
    <Card padding="20px 24px">
      <div style={{ fontSize: 12.5, color: color.textSecondary, fontWeight: font.weight.semibold, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: font.size.pageTitle, fontWeight: font.weight.bold, color: color.textPrimary, margin: '8px 0 2px', letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: color.textMuted }}>{sub}</div>}
    </Card>
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
    <Card>
      <h3 style={cardTitle}>BCS Distribution (latest per cow)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: chart.grid }} tickLine={false} />
          <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [`${value} cows`, 'Count']} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((d) => <Cell key={d.key} fill={BAND_COLOR[d.key]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function TrendChart({ trend }) {
  return (
    <Card>
      <h3 style={cardTitle}>Herd Avg BCS Trend (by week)</h3>
      {trend.length === 0 ? (
        <div style={{ fontSize: 13, color: color.textSecondary, padding: '40px 0', textAlign: 'center' }}>Not enough data yet.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: chart.axis }} axisLine={{ stroke: chart.grid }} tickLine={false} />
            <YAxis domain={[1, 5]} tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => [formatScore(value), 'Avg BCS']} />
            <Line type="monotone" dataKey="avgScore" stroke={chart.health} strokeWidth={2.5} dot={{ r: 3, fill: chart.health, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
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
    <Card>
      <h3 style={cardTitle}>Reviewer Agreement by Source {reviewedCount > 0 && `(of ${reviewedCount} reviewed)`}</h3>
      {reviewedCount === 0 ? (
        <div style={{ fontSize: 13, color: color.textSecondary, padding: '40px 0', textAlign: 'center' }}>
          No reviews yet — this fills in as cows get approved/overridden.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: chart.grid }} tickLine={false} />
            <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value, _name, item) => [`${value} of ${reviewedCount} (${Math.round(item.payload.rate * 100)}%)`, 'Selected']}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((d) => <Cell key={d.key} fill={PROVIDER_COLOR[d.key]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
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
    <Card>
      <h3 style={cardTitle}>Model Influence {reviewedCount > 0 && `(of ${reviewedCount} reviewed)`}</h3>
      {reviewedCount === 0 ? (
        <div style={{ fontSize: 13, color: color.textSecondary, padding: '40px 0', textAlign: 'center' }}>
          No reviews yet — this fills in as cows get approved/overridden.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: chart.grid }} tickLine={false} />
            <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value, _name, item) => [`${value} of ${reviewedCount} (${Math.round(item.payload.rate * 100)}%)`, 'Final score from']}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((d) => <Cell key={d.key} fill={PROVIDER_COLOR[d.key]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function PipelineChart({ counts }) {
  const data = Object.entries(counts).map(([statusKey, count]) => ({ status: statusKey, label: STATUS_LABEL_SHORT[statusKey], count }));
  return (
    <Card>
      <h3 style={cardTitle}>Analyses by Pipeline Status</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: chart.grid }} tickLine={false} />
          <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [`${value} analyses`, 'Count']} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((d) => <Cell key={d.status} fill={statusColor(d.status)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function AttentionList({ items, navigate }) {
  const REASON_LABEL = { thin: 'Too thin', heavy: 'Too heavy', failed: 'Latest upload failed' };
  return (
    <Card>
      <h3 style={cardTitle}>Cows Needing Attention</h3>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: color.textSecondary }}>Nothing flagged — herd looks good.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(({ cow, reason, band }) => (
            <div
              key={cow.cowsId}
              onClick={() => navigate(`/herd/${cow.cowsId}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 12px', borderRadius: radius.sm, border: `1px solid ${color.borderCard}` }}
            >
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: font.weight.semibold, color: color.textPrimary }}>Cow {cow.cowsId}</div>
              <StatusChip
                label={REASON_LABEL[reason]}
                style={reason === 'failed' ? softTint(status.critical) : { color: band.color, background: band.bg }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
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
    <Card>
      <h3 style={cardTitle}>Score Volatility</h3>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: color.textSecondary }}>No significant swings — herd is stable.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(({ cow, previousScore, latestScore, delta }) => {
            const gained = delta > 0;
            const deltaColor = gained ? gainedColor : lostColor;
            return (
              <div
                key={cow.cowsId}
                onClick={() => navigate(`/herd/${cow.cowsId}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 12px', borderRadius: radius.sm, border: `1px solid ${color.borderCard}` }}
              >
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: font.weight.semibold, color: color.textPrimary }}>Cow {cow.cowsId}</div>
                <div style={{ fontSize: 12.5, color: color.textSecondary }}>{formatScore(previousScore)} → {formatScore(latestScore)}</div>
                <StatusChip
                  label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{gained ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{formatScore(Math.abs(delta))}</span>}
                  style={{ color: deltaColor, background: gained ? bandFor(4).bg : bandFor(2).bg }}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
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
      <div style={{ padding: '32px 32px 60px' }}>
        <PageHeader title="Dashboard" subtitle="Herd health and AI review activity at a glance." />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} padding="20px 24px">
              <Skeleton width={80} height={12.5} style={{ marginBottom: 12 }} />
              <Skeleton width={60} height={30} />
            </Card>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px,1fr))', gap: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <Skeleton width={200} height={13.5} style={{ marginBottom: 16 }} />
              <Skeleton height={220} radius={8} />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 32px 60px' }}>
      <PageHeader title="Dashboard" subtitle="Herd health and AI review activity at a glance." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 16, marginBottom: 20 }}>
        <StatTile label="Herd size" value={cows.length} />
        <StatTile label="Herd avg BCS" value={formatScore(herdAvgScore)} sub={herdAvgScore == null ? undefined : bandFor(herdAvgScore).label} />
        <StatTile label="Pending review" value={pendingReview.length} />
        <StatTile label="In pipeline" value={pipelineCounts.not_started + pipelineCounts.processing} sub="not started + processing" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px,1fr))', gap: 20 }}>
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
