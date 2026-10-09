import { initializeApp } from "firebase-admin/app";

initializeApp();

// --- HubSpot → Firestore ---
export { syncDealWebhook } from "./http/syncDealWebhook";

// --- Concesionario (email + password; access granted via userSync.ts) ---
export { getConcesionarioDeals } from "./http/getConcesionarioDeals";
export { uploadCotizacion } from "./http/uploadCotizacion";
export { uploadComprobante } from "./http/uploadComprobante";
export { validarVale } from "./http/validarVale";
export { confirmarDisposicion } from "./http/confirmarDisposicion";

// --- Cliente final (sin sesión: el token de la URL es lo que autoriza) ---
export { getVale } from "./http/getVale";

// --- Admin (Firebase Auth email/password + `admin` claim) ---
export { adminListConcesionarios } from "./http/admin/listConcesionarios";
export { adminUpdateConcesionario } from "./http/admin/updateConcesionario";
export {
  adminGetFieldDictionary,
  adminSetFieldDictionary,
} from "./http/admin/fieldDictionary";
export { adminGetFieldLabels, adminSetFieldLabels } from "./http/admin/fieldLabels";
export { adminGetEtapas, adminSetEtapas } from "./http/admin/etapas";
export { adminGetOcr, adminSetOcr, adminProbarOcr } from "./http/admin/ocr";
export { adminListRevisiones, adminResolverRevision } from "./http/admin/revisiones";
export { adminMigrarLigasArchivos } from "./http/admin/migrarLigas";
export { adminEstadoSistema } from "./http/admin/estado";
export { adminListBitacora } from "./http/admin/bitacora";
export { getArchivoUrl } from "./http/getArchivoUrl";
export {
  adminGetNotificaciones,
  adminSetNotificaciones,
  adminProbarNotificacion,
} from "./http/admin/notificaciones";
export {
  adminGetStageDateProperties,
  adminSetStageDateProperties,
} from "./http/admin/stageDateProperties";
export {
  adminListAdmins,
  adminCreateAdmin,
  adminRevokeAdmin,
  adminSetAdminRol,
} from "./http/admin/admins";
export { adminGetConcesionarioDeals } from "./http/admin/viewConcesionarioDeals";
export { adminUploadCotizacion } from "./http/admin/uploadCotizacion";
export { adminUploadComprobante } from "./http/admin/uploadComprobante";
export { adminSyncConstrurama } from "./http/admin/syncConstrurama";
export { adminGetRollout, adminSetRollout } from "./http/admin/rollout";
export {
  adminValeReporte,
  adminValeIntentos,
  adminGetCancelStages,
  adminSetCancelStages,
} from "./http/admin/valeReporte";
export {
  adminGetVale,
  adminReemitirVale,
  adminGetValeConfig,
  adminSetValeConfig,
} from "./http/admin/vales";

// Tareas programadas
export { sincronizacionPeriodica } from "./programadas/sincronizacionPeriodica";
export { recordatorioRevisiones } from "./programadas/recordatorioRevisiones";
export { revisionDiaria } from "./programadas/revisionDiaria";
