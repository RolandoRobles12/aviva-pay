import { initializeApp } from "firebase-admin/app";

initializeApp();

export { syncDealWebhook } from "./http/syncDealWebhook";
export { getDealStatus } from "./http/getDealStatus";
export { uploadCotizacion } from "./http/uploadCotizacion";
export { uploadComprobante } from "./http/uploadComprobante";
