import { useEffect, useState } from 'react';
import { subscribeToast } from '../lib/toast';

export const Toast = () => {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    return subscribeToast((msg) => {
      setMessage(msg);
      setVisible(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        setVisible(false);
      }, 2600);
    });
  }, []);

  return (
    <div className={`toast-box ${visible ? 'show' : ''}`} id="toast-box" role="status" aria-live="polite">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span id="toast-message">{message}</span>
    </div>
  );
};
