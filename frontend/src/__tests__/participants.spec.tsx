import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ParticipantsTable from '@/components/participants/ParticipantsTable';
import userEvent from '@/test-utils/user-event';
import type { Participant } from '@/types/event';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt ?? ''} />,
}));

const buildParticipants = (): Participant[] => [
  {
    id: 1,
    role: 'organizer',
    joinedAt: '2025-01-01T00:00:00Z',
    user: { id: 11, email: 'alice@example.com', name: 'Alice Johnson', avatar: null },
  },
  {
    id: 2,
    role: 'member',
    joinedAt: '2025-01-02T00:00:00Z',
    user: { id: 12, email: 'bob@example.com', name: 'Bob Smith', avatar: null },
  },
];

describe('ParticipantsTable', () => {
  it('renders participant list', () => {
    render(
      <ParticipantsTable
        participants={buildParticipants()}
        currentUserId={11}
        isLoading={false}
        canManage
        roleChangingId={null}
        removingId={null}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('calls handler when role changes', async () => {
    const onRoleChange = vi.fn();
    render(
      <ParticipantsTable
        participants={buildParticipants()}
        currentUserId={11}
        isLoading={false}
        canManage
        roleChangingId={null}
        removingId={null}
        onRoleChange={onRoleChange}
        onRemove={vi.fn()}
      />,
    );

    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[1], 'organizer');

    expect(onRoleChange).toHaveBeenCalledWith(2, 'organizer');
  });

  it('disables delete button for the last organizer', () => {
    const soleOrganizer: Participant[] = [
      {
        id: 1,
        role: 'organizer',
        joinedAt: '2025-01-01T00:00:00Z',
        user: { id: 10, email: 'solo@example.com', name: 'Solo Organizer', avatar: null },
      },
    ];

    render(
      <ParticipantsTable
        participants={soleOrganizer}
        currentUserId={10}
        isLoading={false}
        canManage
        roleChangingId={null}
        removingId={null}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: /Удалить/i });
    expect(deleteButton).toBeDisabled();
  });

  it('renders controls in read-only mode', () => {
    render(
      <ParticipantsTable
        participants={buildParticipants()}
        currentUserId={11}
        isLoading={false}
        canManage={false}
        roleChangingId={null}
        removingId={null}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const select = screen.getAllByRole('combobox')[0];
    const deleteButton = screen.getAllByRole('button', { name: /Удалить/i })[0];
    expect(select).toBeDisabled();
    expect(deleteButton).toBeDisabled();
  });
});
