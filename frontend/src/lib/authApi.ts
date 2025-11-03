import { apiFetch } from '@/lib/fetcher';

export async function confirmRegistration(token: string): Promise<{ message: string }> {
  const url = `/api/auth/confirm?token=${encodeURIComponent(token)}`;
  return apiFetch<{ message: string }>(url, { method: 'GET', skipAuth: true });
}

export async function resendConfirmationEmail(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/auth/resend-confirmation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
    skipAuth: true,
  });
}

export async function confirmEmailChange(token: string): Promise<{ detail: string }> {
  const url = `/api/account/email/change-confirm?token=${encodeURIComponent(token)}`;
  return apiFetch<{ detail: string }>(url, { method: 'GET', skipAuth: true });
}
