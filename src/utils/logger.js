/**
 * Centralized Logger with Asia/Jakarta timestamps and module tagging
 */
function getTimestamp() {
  const now = new Date();
  const d = now.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const t = now.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${d} ${t}`;
}

const logger = {
  info(tag, message, ...args) {
    console.log(`[${getTimestamp()}] [INFO] [${tag}] ${message}`, ...args);
  },
  warn(tag, message, ...args) {
    console.warn(`[${getTimestamp()}] [WARN] [${tag}] ${message}`, ...args);
  },
  error(tag, message, ...args) {
    console.error(`[${getTimestamp()}] [ERROR] [${tag}] ${message}`, ...args);
  },
  debug(tag, message, ...args) {
    console.debug(`[${getTimestamp()}] [DEBUG] [${tag}] ${message}`, ...args);
  },

  /**
   * Express middleware to log incoming HTTP requests and their completion status
   */
  requestMiddleware(req, res, next) {
    const start = Date.now();
    const { method, originalUrl } = req;

    res.on("finish", () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      logger[level]("HTTP", `${method} ${originalUrl} ${status} - ${duration}ms`);
    });

    next();
  },
};

module.exports = logger;
