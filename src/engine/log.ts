// Structured JSON logs: one object per line, searchable in Vercel's log viewer.
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, event: string, fields: Fields) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields }, (_k, v) =>
    v instanceof Error ? { message: v.message, name: v.name } : v,
  );
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  warn: (event: string, fields: Fields = {}) => emit("warn", event, fields),
  error: (event: string, fields: Fields = {}) => emit("error", event, fields),
};

export type Logger = typeof log;
