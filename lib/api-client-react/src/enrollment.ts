import { customFetch } from "./custom-fetch";

export interface EnrollmentTokenResponse {
  token: string;
  enrollUrl: string;
  expiresAt: string;
}

export interface EnrollDeviceRequest {
  token: string;
  name: string;
  ip: string;
}

export interface EnrolledDevice {
  id: string;
  name: string;
  ip: string;
  status: string;
  tenantId: string;
  lastSeen: string | null;
  createdAt: string;
}

export const getEnrollmentToken = async (
  options?: RequestInit
): Promise<EnrollmentTokenResponse> => {
  return customFetch<EnrollmentTokenResponse>("/api/enrollment/token", {
    ...options,
    method: "GET",
  });
};

export const enrollDevice = async (
  data: EnrollDeviceRequest,
  options?: RequestInit
): Promise<EnrolledDevice> => {
  return customFetch<EnrolledDevice>("/api/devices/enroll", {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};
