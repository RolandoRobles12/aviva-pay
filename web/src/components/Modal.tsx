import type { ReactNode } from "react";

export function Modal({
  onClose,
  children,
  className,
}: {
  onClose: () => void;
  children: ReactNode;
  /** Clase extra para el panel, p. ej. para una ventana más ancha. */
  className?: string;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={className ? `modal-panel ${className}` : "modal-panel"}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
