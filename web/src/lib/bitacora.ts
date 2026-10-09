/** Las llaves de primer nivel que cambiaron, para no mostrar el documento entero. */
export function llavesCambiadas(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null,
): string[] {
  const llaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  return [...llaves].filter(
    (k) => JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(despues?.[k] ?? null),
  );
}
