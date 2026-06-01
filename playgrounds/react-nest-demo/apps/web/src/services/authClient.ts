import { LoginRequest } from "../../../../packages/shared/src/auth/contracts";

export async function login(payload: LoginRequest) {
  return {
    endpoint: "/api/auth/login",
    payload
  };
}
