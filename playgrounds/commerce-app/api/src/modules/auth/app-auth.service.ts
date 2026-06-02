export class AppAuthService {
  getCurrentAppApiKey(headers: Record<string, string>) {
    return headers["x-commerce-api-key"] || "";
  }

  authorizeCurrentApp(headers: Record<string, string>) {
    const apiKey = this.getCurrentAppApiKey(headers);
    return apiKey.startsWith("ck_");
  }
}
