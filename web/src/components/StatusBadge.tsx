import type { UploadStatus } from "../types/deal";

export function StatusBadge({ status }: { status: UploadStatus }) {
  const isDone = status === "completado";
  return (
    <span className={`status-badge ${isDone ? "status-badge--done" : "status-badge--pending"}`}>
      {isDone ? "Completado" : "Pendiente"}
    </span>
  );
}
