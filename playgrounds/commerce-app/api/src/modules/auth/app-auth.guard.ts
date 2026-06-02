import { AppAuthService } from "./app-auth.service";

export class AppAuthGuard {
  constructor(private readonly auth: AppAuthService) {}

  canActivate(headers: Record<string, string>) {
    return this.auth.authorizeCurrentApp(headers);
  }
}
