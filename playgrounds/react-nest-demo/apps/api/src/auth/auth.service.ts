import { LoginRequest } from "../../../../packages/shared/src/auth/contracts";

export class AuthService {
  login(payload: LoginRequest) {
    return {
      userId: payload.email,
      token: "session-token"
    };
  }
}
