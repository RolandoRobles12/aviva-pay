import { initializeApp } from "firebase-admin/app";

initializeApp();

export { syncDealWebhook } from "./http/syncDealWebhook";
export { getConcesionarioDeals } from "./http/getConcesionarioDeals";
export { uploadCotizacion } from "./http/uploadCotizacion";
export { uploadComprobante } from "./http/uploadComprobante";
