import { useState } from 'react';
import { LiveSessionPlaceholder } from '../features/live-session/LiveSessionPlaceholder';
import { QuickAnalysis } from '../features/quick-analysis/QuickAnalysis';
import { ReportPlaceholder } from '../features/reports/ReportPlaceholder';

type Page = 'analyze' | 'live' | 'report';

const navItems: { id: Page; label: string }[] = [
  { id: 'analyze', label: 'ตรวจสอบข้อมูล' },
  { id: 'live', label: 'สนทนาสด' },
  { id: 'report', label: 'รายงาน' },
];

export const App = () => {
  const [page, setPage] = useState<Page>('analyze');

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage('analyze')} aria-label="ScamTrap AI home">
          <span className="brand-mark">S</span>
          <span>ScamTrap <b>AI</b></span>
        </button>
        <nav aria-label="เมนูหลัก">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="prototype-badge">HACKATHON PROTOTYPE</span>
      </header>

      {page === 'analyze' && <QuickAnalysis />}
      {page === 'live' && <LiveSessionPlaceholder />}
      {page === 'report' && <ReportPlaceholder />}
    </div>
  );
};
