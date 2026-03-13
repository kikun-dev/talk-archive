"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Toast } from "@/components/Toast";

type ToastType = "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  addToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const isMounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType) => {
      const id = crypto.randomUUID();
      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        if (next.length > MAX_TOASTS) {
          const removed = next[0];
          const timer = timersRef.current.get(removed.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(removed.id);
          }
          return next.slice(1);
        }
        return next;
      });

      const timer = setTimeout(() => {
        dismiss(id);
      }, AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {isMounted &&
        createPortal(
          <div className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
            {toasts.map((toast) => (
              <Toast
                key={toast.id}
                id={toast.id}
                message={toast.message}
                type={toast.type}
                onDismiss={dismiss}
              />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
