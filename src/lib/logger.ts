export type LogEntry = { ts: string; level: "info" | "warn" | "error"; step: string; msg: string };

export type Logger = {
  info: (step: string, msg: string) => void;
  warn: (step: string, msg: string) => void;
  error: (step: string, msg: string) => void;
  entries: LogEntry[];
};

/** Logger that both prints and accumulates entries so the job store can persist them. */
export function createLogger(jobId: string): Logger {
  const entries: LogEntry[] = [];
  const log = (level: LogEntry["level"], step: string, msg: string) => {
    const entry = { ts: new Date().toISOString(), level, step, msg };
    entries.push(entry);
    // eslint-disable-next-line no-console
    console[level === "info" ? "log" : level](`[${jobId}] [${step}] ${msg}`);
  };
  return {
    info: (s, m) => log("info", s, m),
    warn: (s, m) => log("warn", s, m),
    error: (s, m) => log("error", s, m),
    entries,
  };
}
