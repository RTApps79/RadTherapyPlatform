/**
 * RTApps RadTherapyPlatform — Logger
 * Copyright (c) 2026 Kevin Kindle. All Rights Reserved.
 */

import type { LogLevel } from "./types";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

export type LogSink = (entry: LogEntry) => void;

const consoleSink: LogSink = (entry) => {
  const line = `[${entry.timestamp}] [${entry.scope}] ${entry.message}`;
  switch (entry.level) {
    case "debug":
      console.debug(line, entry.data ?? "");
      break;
    case "info":
      console.info(line, entry.data ?? "");
      break;
    case "warn":
      console.warn(line, entry.data ?? "");
      break;
    case "error":
      console.error(line, entry.data ?? "");
      break;
  }
};

/**
 * Central logger. Create scoped instances with `.scope("ModuleName")` so log
 * lines are traceable back to the module/service that emitted them, which
 * matters once the platform has a dozen concurrently active modules.
 */
export class Logger {
  private sinks: LogSink[] = [consoleSink];

  constructor(
    private readonly scopeName: string = "app",
    private minLevel: LogLevel = "debug",
  ) {}

  scope(scopeName: string): Logger {
    const child = new Logger(`${this.scopeName}:${scopeName}`, this.minLevel);
    child.sinks = this.sinks;
    return child;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /** Register an additional sink (e.g. a future remote/audit log service). */
  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  debug(message: string, data?: unknown): void {
    this.write("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.write("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.write("error", message, data);
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const entry: LogEntry = {
      level,
      scope: this.scopeName,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
    this.sinks.forEach((sink) => sink(entry));
  }
}
