const IS_PRODUCTION = process.env.NODE_ENV === "production";

function noop() {}

const logger = {
  debug: IS_PRODUCTION ? noop : console.log.bind(console),
  info: IS_PRODUCTION ? noop : console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export default logger;
