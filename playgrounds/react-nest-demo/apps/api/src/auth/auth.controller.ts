import { AuthService } from "./auth.service";
import { LoginRequest } from "../../../../packages/shared/src/auth/contracts";

export class AuthController {
  constructor(private readonly authService = new AuthService()) {}

  login(payload: LoginRequest) {
    return this.authService.login(payload);
  }
}
