import { AuthModule } from "./auth/auth.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { NotificationsModule } from "./notifications/notifications.module";

export class AppModule {
  modules = [AuthModule, CheckoutModule, NotificationsModule];
}
