const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;

export const API_BASE_URL =
  publicApiUrl !== undefined
    ? publicApiUrl
    : process.env.NODE_ENV === "development"
      ? "http://localhost:8080"
      : "";
