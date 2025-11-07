const promClient = require('prom-client');

class MetricsCollector {
  constructor() {
    this.register = new promClient.Registry();

    // Default metrics
    promClient.collectDefaultMetrics({ register: this.register });

    // Custom metrics
    this.notificationsReceived = new promClient.Counter({
      name: 'notifications_received_total',
      help: 'Total number of notifications received',
      labelNames: ['eventType'],
      registers: [this.register]
    });

    this.notificationsDispatched = new promClient.Counter({
      name: 'notifications_dispatched_total',
      help: 'Total number of notifications dispatched',
      labelNames: ['channel', 'provider'],
      registers: [this.register]
    });

    this.notificationsSent = new promClient.Counter({
      name: 'notifications_sent_total',
      help: 'Total number of notifications sent successfully',
      labelNames: ['channel', 'provider'],
      registers: [this.register]
    });

    this.notificationsFailed = new promClient.Counter({
      name: 'notifications_failed_total',
      help: 'Total number of notifications failed',
      labelNames: ['channel', 'provider', 'reason'],
      registers: [this.register]
    });

    this.attemptDuration = new promClient.Histogram({
      name: 'notifications_attempt_duration_seconds',
      help: 'Duration of notification attempts',
      labelNames: ['channel', 'provider'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register]
    });

    this.notificationsInflight = new promClient.Gauge({
      name: 'notifications_inflight',
      help: 'Number of notifications currently being processed',
      labelNames: ['channel'],
      registers: [this.register]
    });

    this.dedupeHits = new promClient.Counter({
      name: 'dedupe_hits_total',
      help: 'Total number of duplicate events detected',
      registers: [this.register]
    });

    this.providerRateLimited = new promClient.Counter({
      name: 'provider_rate_limited_total',
      help: 'Total number of rate limit hits by provider',
      labelNames: ['provider'],
      registers: [this.register]
    });
  }

  recordReceived(eventType) {
    this.notificationsReceived.inc({ eventType });
  }

  recordDispatched(channel, provider) {
    this.notificationsDispatched.inc({ channel, provider });
  }

  recordSent(channel, provider, durationMs) {
    this.notificationsSent.inc({ channel, provider });
    this.attemptDuration.observe({ channel, provider }, durationMs / 1000);
  }

  recordFailed(channel, provider, reason) {
    this.notificationsFailed.inc({ channel, provider, reason });
  }

  recordInflight(channel, delta) {
    this.notificationsInflight.inc({ channel }, delta);
  }

  recordDedupeHit() {
    this.dedupeHits.inc();
  }

  recordRateLimited(provider) {
    this.providerRateLimited.inc({ provider });
  }

  getMetrics() {
    return this.register.metrics();
  }
}

module.exports = MetricsCollector;
