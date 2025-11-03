import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as profileApi from '@/lib/profileApi';

import ProfileAccountPanel from '../ProfileAccountPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

const requestEmailChangeMock = vi.spyOn(profileApi, 'requestEmailChange');
const updateEmailNotificationsMock = vi.spyOn(profileApi, 'updateEmailNotifications');

beforeEach(() => {
  requestEmailChangeMock.mockResolvedValue(undefined);
  updateEmailNotificationsMock.mockResolvedValue({ email_notifications_enabled: true });
});

describe('ProfileAccountPanel', () => {
  it('sends email change request and shows status message', async () => {
    render(
      <ProfileAccountPanel
        email="old@example.com"
        emailNotificationsEnabled
        onNotify={vi.fn()}
        onEmailNotificationsChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/New email/i);
    fireEvent.change(input, { target: { value: 'new@example.com' } });

    const button = screen.getByRole('button', { name: /Send confirmation/i });
    fireEvent.click(button);

    expect(requestEmailChangeMock).toHaveBeenCalledWith({ new_email: 'new@example.com' });

    await screen.findByText(/Confirmation email sent to new@example.com/i);
  });

  it('toggles email notifications', async () => {
    const notify = vi.fn();
    const onEmailNotificationsChange = vi.fn();

    render(
      <ProfileAccountPanel
        email="user@example.com"
        emailNotificationsEnabled={false}
        onNotify={notify}
        onEmailNotificationsChange={onEmailNotificationsChange}
      />,
    );

    const toggle = screen.getByRole('button', { name: /Toggle email reminders/i });
    fireEvent.click(toggle);

    expect(updateEmailNotificationsMock).toHaveBeenCalledWith({ email_notifications_enabled: true });
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('success', 'Email reminders enabled.');
      expect(onEmailNotificationsChange).toHaveBeenCalledWith(true);
    });
  });
});
