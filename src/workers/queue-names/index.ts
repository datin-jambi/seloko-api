// ─── RabbitMQ Queue & Routing Key Registry ─────────────────────────────────────
// All queue names and routing keys are defined here as constants.
// This prevents typos and gives a single source of truth.

export const QUEUES = {
  AUDIT_LOG: "seloko.audit_log",
  NOTIFICATION_EMAIL: "seloko.notification.email",
  NOTIFICATION_PUSH: "seloko.notification.push",
  IMAGE_PROCESS: "seloko.image.process",
  REPORT_GENERATE: "seloko.report.generate",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ─── Routing Keys (Topic Exchange Pattern) ────────────────────────────────────
// Pattern: "<domain>.<entity>.<event>"
// Consumers can bind with wildcards: "audit.*.*" or "notification.#"
export const ROUTING_KEYS = {
  // Audit
  AUDIT_USER_LOGIN: "audit.user.login",
  AUDIT_USER_LOGOUT: "audit.user.logout",
  AUDIT_USER_CREATED: "audit.user.created",
  AUDIT_PERMISSION_CHANGED: "audit.permission.changed",
  AUDIT_CONTENT_STATUS: "audit.content.status",

  // Notifications
  NOTIFY_EMAIL_WELCOME: "notification.email.welcome",
  NOTIFY_EMAIL_RESET_PASSWORD: "notification.email.reset_password",
  NOTIFY_EMAIL_VERIFICATION: "notification.email.verification",
  NOTIFY_PUSH_GENERIC: "notification.push.generic",

  // Media
  IMAGE_COMPRESS: "image.process.compress",
  IMAGE_RESIZE: "image.process.resize",

  // Reports
  REPORT_GENERATE_PDF: "report.generate.pdf",
  REPORT_GENERATE_EXCEL: "report.generate.excel",
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];
