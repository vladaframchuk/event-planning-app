import type { UseQueryResult } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EventProgressBar from '@/components/EventProgressBar';
import { useEventProgress } from '@/hooks/useEventProgress';
import type { EventProgress } from '@/lib/eventsApi';

vi.mock('@/hooks/useEventProgress', () => ({
  useEventProgress: vi.fn(),
}));

const mockedUseEventProgress = vi.mocked(useEventProgress);

const baseProgress: EventProgress = {
  event_id: 42,
  total_tasks: 6,
  counts: {
    todo: 1,
    doing: 2,
    done: 3,
  },
  percent_done: 50,
  by_list: [
    {
      list_id: 7,
      title: 'Backlog',
      total: 3,
      todo: 1,
      doing: 1,
      done: 1,
    },
  ],
  generated_at: new Date().toISOString(),
  ttl_seconds: 30,
};

describe('EventProgressBar', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders summary and progress bar when data is available', () => {
    mockedUseEventProgress.mockReturnValue({
      data: baseProgress,
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as UseQueryResult<EventProgress, Error>);

    render(<EventProgressBar eventId={baseProgress.event_id} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText((content) => content.includes('50%'))).toBeInTheDocument();
  });

  it('reveals per-list details after toggling the lists button', () => {
    mockedUseEventProgress.mockReturnValue({
      data: baseProgress,
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as UseQueryResult<EventProgress, Error>);

    render(<EventProgressBar eventId={baseProgress.event_id} />);

    expect(screen.queryByText('Backlog')).not.toBeInTheDocument();

    const toggleButton = screen.getByRole('button');
    fireEvent.click(toggleButton);

    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
  });

  it('shows toast when hook returns an error', async () => {
    mockedUseEventProgress.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('Network down'),
    } as unknown as UseQueryResult<EventProgress, Error>);

    render(<EventProgressBar eventId={baseProgress.event_id} />);

    const errorMessages = await screen.findAllByText('Network down');
    expect(errorMessages.length).toBeGreaterThan(0);
  });
});


