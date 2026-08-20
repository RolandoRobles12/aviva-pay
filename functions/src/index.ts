import { initializeApp } from "firebase-admin/app";

initializeApp();

// --- HubSpot → Firestore ---
export { syncDealWebhook } from "./http/syncDealWebhook";

// --- Concesionario (código + NIP) ---
export { loginConcesionario } from "./http/loginConcesionario";
export { getConcesionarioDeals } from "./http/getConcesionarioDeals";
export { uploadCotizacion } from "./http/uploadCotizacion";
export { uploadComprobante } from "./http/uploadComprobante";

// --- Admin (Firebase Auth email/password + `admin` claim) ---
export { adminListConcesionarios } from "./http/admin/listConcesionarios";
export { adminUpdateConcesionario } from "./http/admin/updateConcesionario";
export { adminGenerarNip } from "./http/admin/generarNip";
export {
  adminGetFieldDictionary,
  adminSetFieldDictionary,
} from "./http/admin/fieldDictionary";
export { adminGetFieldLabels, adminSetFieldLabels } from "./http/admin/fieldLabels";
export {
  adminListAdmins,
  adminCreateAdmin,
  adminRevokeAdmin,
} from "./http/admin/admins";
export { adminGetConcesionarioDeals } from "./http/admin/viewConcesionarioDeals";
