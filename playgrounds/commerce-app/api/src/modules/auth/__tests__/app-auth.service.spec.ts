import { AppAuthService } from "../app-auth.service";

export function appAuthServiceSpec() {
  const service = new AppAuthService();
  return service.authorizeCurrentApp({ "x-commerce-api-key": "ck_test" });
}
