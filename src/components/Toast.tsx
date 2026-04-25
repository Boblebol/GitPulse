import { Check, X } from "lucide-react";
import { useAppContext } from "../context/AppContext";

export function ToastContainer() {
  const { notifications, removeNotification } = useAppContext();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-top-2 ${
            notif.type === "success"
              ? "bg-tertiary text-on-tertiary"
              : "bg-error text-on-error"
          }`}
        >
          {notif.type === "success" ? (
            <Check size={18} />
          ) : (
            <X size={18} />
          )}
          <span className="text-sm font-medium flex-1">{notif.message}</span>
          <button
            onClick={() => removeNotification(notif.id)}
            className="opacity-70 hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
