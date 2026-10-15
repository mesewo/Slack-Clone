// @ts-ignore
import axios from "axios";
import { API_BASE_URL } from "@/lib/api-base-url";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // required to send/receive the HttpOnly auth cookie
});
