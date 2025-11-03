import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n';
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

    const input = screen.getByLabelText(t('profile.account.field.newEmail'));
    fireEvent.change(input, { target: { value: 'new@example.com' } });

    const button = screen.getByRole('button', { name: t('profile.account.action.sendConfirmation') });
    fireEvent.click(button);

    expect(requestEmailChangeMock).toHaveBeenCalledWith({ new_email: 'new@example.com' });

    await screen.findByText(t('profile.account.emailChange.status', { email: 'new@example.com' }));
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

    const toggle = screen.getByRole('button', { name: t('profile.account.notifications.toggleAria') });
    fireEvent.click(toggle);

    expect(updateEmailNotificationsMock).toHaveBeenCalledWith({ email_notifications_enabled: true });
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith('success', t('profile.account.notifications.enabled'));
      expect(onEmailNotificationsChange).toHaveBeenCalledWith(true);
    });
  });
});
