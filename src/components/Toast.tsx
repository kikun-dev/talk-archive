type ToastType = "success" | "error";

type ToastProps = {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
};

const typeStyles: Record<ToastType, string> = {
  success:
    "border-green-200 bg-green-50 text-green-800",
  error:
    "border-red-200 bg-red-50 text-red-800",
};

export function Toast({ id, message, type, onDismiss }: ToastProps) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg ${typeStyles[type]}`}
    >
      <p className="flex-1 text-sm">{message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="shrink-0 text-current opacity-60 hover:opacity-100"
        aria-label="閉じる"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
