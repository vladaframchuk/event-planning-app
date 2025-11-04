import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { confirmRegistration, resendConfirmationEmail } from '@/lib/authApi';
import { t } from '@/lib/i18n';

import ConfirmPage from '../page';

const confirmRegistrationMock = confirmRegistration as unknown as Mock;
const resendConfirmationEmailMock = resendConfirmationEmail as unknown as Mock;

vi.mock('@/lib/authApi', () => ({
  confirmRegistration: vi.fn(),
  resendConfirmationEmail: vi.fn(),
}));

const useSearchParamsMock = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

describe('ConfirmPage', () => {
  it('shows success message when confirmation succeeds', async () => {
    useSearchParamsMock.mockReturnValue({ get: () => 'token123' });
    confirmRegistrationMock.mockResolvedValue({ message: 'email_confirmed' });

    render(<ConfirmPage />);

    expect(screen.getByText(t('auth.confirm.loading'))).toBeInTheDocument();
    await screen.findByText(/email_confirmed/i);
  });

  it('shows error when token is missing', async () => {
    useSearchParamsMock.mockReturnValue({ get: () => null });

    render(<ConfirmPage />);

    await screen.findByText(t('auth.confirm.error.missingToken'));
  });

  it('allows resending confirmation email', async () => {
    useSearchParamsMock.mockReturnValue({ get: () => 'token123' });
    confirmRegistrationMock.mockResolvedValue({ message: 'ok' });
    resendConfirmationEmailMock.mockResolvedValue({ message: 'resent' });

    render(<ConfirmPage />);
    await screen.findByText(/ok/i);

    const emailInput = screen.getByLabelText(/Email/i);
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const submit = screen.getByRole('button', { name: t('auth.confirm.resend.submit') });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(resendConfirmationEmailMock).toHaveBeenCalledWith('user@example.com');
    });
  });
});
