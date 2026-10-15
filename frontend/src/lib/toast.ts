type ToastListener = (message: string) => void;
const listeners = new Set<ToastListener>();

export const showToast = (message: string) => {
  listeners.forEach((listener) => listener(message));
};

export const subscribeToast = (listener: ToastListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const copyToClipboard = async (text: string, label = text) => {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`คัดลอกแล้ว: ${label}`);
  } catch {
    showToast(`คัดลอก: ${label}`);
  }
};
