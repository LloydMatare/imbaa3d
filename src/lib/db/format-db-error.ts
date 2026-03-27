type MaybePgError = {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  hint?: unknown;
  schema?: unknown;
  table?: unknown;
  column?: unknown;
  constraint?: unknown;
  routine?: unknown;
  [k: string]: unknown;
};

function pickString(x: unknown): string | undefined {
  return typeof x === "string" && x.length ? x : undefined;
}

/**
 * Best-effort formatter for errors thrown by `postgres` / Drizzle so we can see
 * the real root cause (ECONNREFUSED, missing table, bad password, etc.) in the
 * Next.js error overlay.
 */
export function formatDbError(err: unknown): string {
  if (err instanceof AggregateError) {
    const parts = err.errors
      .map((e) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)))
      .filter(Boolean);
    return parts.length ? parts.join(" | ") : "AggregateError";
  }

  // Some libraries throw plain Errors with an `errors` array (AggregateError-like)
  // but without inheriting from AggregateError.
  if (err && typeof err === "object" && Array.isArray((err as { errors?: unknown }).errors)) {
    const e = err as { errors: unknown[]; code?: unknown; message?: unknown };
    const parts = e.errors
      .map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x)))
      .filter(Boolean);
    const code = pickString(e.code);
    const head = pickString(e.message) ?? "Error";
    const suffix = parts.length ? `; ${parts.join(" | ")}` : "";
    return `${head}${code ? ` (code=${code})` : ""}${suffix}`;
  }

  if (err instanceof Error) {
    const e = err as Error & MaybePgError;
    const code = pickString(e.code);
    const msg = pickString(e.message) ?? err.message;
    const detail = pickString(e.detail);
    const hint = pickString(e.hint);
    const table = pickString(e.table);
    const schema = pickString(e.schema);
    const column = pickString(e.column);
    const constraint = pickString(e.constraint);

    const extras = [
      code ? `code=${code}` : undefined,
      schema ? `schema=${schema}` : undefined,
      table ? `table=${table}` : undefined,
      column ? `column=${column}` : undefined,
      constraint ? `constraint=${constraint}` : undefined,
      detail ? `detail=${detail}` : undefined,
      hint ? `hint=${hint}` : undefined,
    ].filter(Boolean);

    const cause = (e as unknown as { cause?: unknown }).cause;
    const base = extras.length ? `${msg} (${extras.join(", ")})` : msg;
    return cause ? `${base} <- ${formatDbError(cause)}` : base;
  }

  return typeof err === "string" ? err : "Unknown error";
}
