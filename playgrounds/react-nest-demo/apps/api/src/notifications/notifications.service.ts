export class NotificationsService {
  sendOrderConfirmation(userId: string, total: number) {
    return {
      userId,
      total,
      channel: "email"
    };
  }
}
