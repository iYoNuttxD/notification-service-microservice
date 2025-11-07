const Notification = require('../../../src/domain/entities/Notification');

describe('Notification Entity', () => {
  it('should create a notification', () => {
    const notification = new Notification({
      eventId: 'evt-123',
      eventType: 'orders.paid',
      recipient: {
        userId: 'user-1',
        email: 'test@example.com'
      },
      templateKey: 'order_paid',
      metadata: { orderId: '12345' }
    });

    expect(notification.eventId).toBe('evt-123');
    expect(notification.eventType).toBe('orders.paid');
    expect(notification.status).toBe('QUEUED');
  });

  it('should mark channel as tried', () => {
    const notification = new Notification({
      eventId: 'evt-123',
      eventType: 'orders.paid',
      recipient: { email: 'test@example.com' },
      templateKey: 'order_paid'
    });

    notification.markChannelTried('email');
    expect(notification.channelsTried).toContain('email');
  });

  it('should update status', () => {
    const notification = new Notification({
      eventId: 'evt-123',
      eventType: 'orders.paid',
      recipient: { email: 'test@example.com' },
      templateKey: 'order_paid'
    });

    notification.updateStatus('SENT');
    expect(notification.status).toBe('SENT');
  });

  it('should detect deliverer role', () => {
    const notification = new Notification({
      eventId: 'evt-123',
      eventType: 'delivery.assigned',
      recipient: {
        userId: 'deliverer-1',
        role: 'deliverer'
      },
      templateKey: 'delivery_assigned'
    });

    expect(notification.isDeliverer()).toBe(true);
  });
});
