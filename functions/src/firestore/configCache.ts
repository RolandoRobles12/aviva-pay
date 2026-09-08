/**
 * Cuánto vive en memoria una configuración leída de Firestore.
 *
 * Estas configuraciones (diccionario de campos, etiquetas, fechas de
 * etapa, rollout, vigencia del vale) las necesita cada sincronización, así
 * que releerlas en cada webhook agregaría un viaje a Firestore en el
 * camino caliente para datos que cambian dos veces al año. De ahí el
 * caché.
 *
 * Antes ese caché no caducaba nunca, y eso tenía un efecto que parecía un
 * bug de guardado: en Cloud Functions v2 **cada función es su propio
 * servicio**, con su propio proceso. Cuando `adminSetFieldDictionary`
 * limpiaba su caché, lo limpiaba en un proceso que no es el que atiende
 * `adminGetFieldDictionary` — así que el admin guardaba, recargaba la
 * pantalla y le seguían apareciendo los valores viejos, a veces por horas,
 * hasta que esa instancia se reciclara. El dato sí estaba guardado en
 * Firestore; lo que mentía era la lectura.
 *
 * Un minuto acota esa ventana sin devolver el viaje a Firestore al camino
 * caliente. Y las pantallas de admin no dependen de esto: leen siempre
 * fresco, saltándose el caché (ver las funciones `...Fresh`).
 */
export const TTL_CONFIG_MS = 60_000;
