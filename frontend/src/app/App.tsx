import { useState } from 'react';
import { LiveSessionView } from '../features/live-session/LiveSessionView';
import { QuickAnalysis } from '../features/quick-analysis/QuickAnalysis';
import { ReportPlaceholder } from '../features/reports/ReportPlaceholder';


type Page = 'analyze' | 'live' | 'report';

const getInitialPage = (): Page => {
  const params = new URLSearchParams(window.location.search);
  return params.has('session') && params.has('join') ? 'live' : 'analyze';
};

const navItems: { id: Page; label: string }[] = [
  { id: 'analyze', label: 'ตรวจสอบข้อมูล' },
  { id: 'live', label: 'สนทนาสด' },
  { id: 'report', label: 'รายงาน' },
];

export const App = () => {
  const [page, setPage] = useState<Page>(getInitialPage);

  const navigate = (nextPage: Page) => {
    if (nextPage !== 'live' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    setPage(nextPage);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('analyze')} aria-label="ScamTrap AI home">
          <span className="brand-mark">S</span>
          <span>ScamTrap <b>AI</b></span>
        </button>
        <nav aria-label="เมนูหลัก">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="prototype-badge">HACKATHON PROTOTYPE</span>
      </header>

      {page === 'analyze' && <QuickAnalysis />}
      {page === 'live' && <LiveSessionView />}
      {page === 'report' && <ReportPlaceholder />}
    </div>
  );
};

