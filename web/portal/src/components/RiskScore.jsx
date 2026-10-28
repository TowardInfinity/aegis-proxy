const LEVEL_COLOR = {
  CRITICAL: 'var(--accent-rose)',
  HIGH: 'var(--accent-amber)',
  MEDIUM: 'var(--accent-saffron)',
  LOW: 'var(--accent-emerald)',
};

export function riskColor(level) {
  return LEVEL_COLOR[level] || LEVEL_COLOR.LOW;
}

// RiskScore shows a 0-100 score as a number, its level and a bar. With
// factors, it lists each signal's points; the top one sets the score.
export default function RiskScore({ score, level, factors }) {
  const color = riskColor(level);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>RISK SCORE</div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{score}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>/100</span>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color }}>{level} risk</div>
        </div>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-subtle)', marginTop: '6px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color }} />
      </div>
      {Array.isArray(factors) && (
        <div style={{ marginTop: '10px' }}>
          {factors.length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>No risk signals. Nothing matched a detector, an attack rule or the judge.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px', fontSize: '0.75rem' }}>
              {factors.map((factor, index) => (
                <div
                  key={`${factor.label}-${index}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'var(--bg-surface)',
                    border: `1px solid ${index === 0 ? color : 'var(--border-subtle)'}`,
                  }}
                >
                  {factor.label}: <strong>{factor.points} pts</strong>
                  {index === 0 && <span style={{ color, fontWeight: 700 }}> · sets the score</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '6px' }}>
            Score is the strongest signal's confidence × 100. 80+ critical, 60+ high, 30+ medium.
          </div>
        </div>
      )}
    </div>
  );
}
