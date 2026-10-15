import type { RiskLevel } from '@scamtrap/contracts';

interface RiskGaugeProps {
  score: number;
  level: RiskLevel;
}

const labels: Record<RiskLevel, string> = {
  low: 'ความเสี่ยงต่ำ',
  medium: 'ควรระวัง',
  high: 'ความเสี่ยงสูง',
  critical: 'อันตรายมาก',
};

export const RiskGauge = ({ score, level }: RiskGaugeProps) => (
  <div className={`risk-gauge risk-gauge--${level}`} aria-label={`${labels[level]} ${score} จาก 100`}>
    <div className="risk-gauge__score">
      <strong>{score}</strong>
      <span>/100</span>
    </div>
    <div>
      <span className="eyebrow">ผลประเมิน</span>
      <h3>{labels[level]}</h3>
    </div>
  </div>
);
