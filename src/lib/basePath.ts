export const BASE_PATH = process.env.NODE_ENV === "production" ? "/payments" : "";

export function withBase(path: string): string {
  return path.startsWith("/") ? `${BASE_PATH}${path}` : path;
}
