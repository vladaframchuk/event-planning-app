'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { Event } from '@/types/event';

type EventListProps = {
  events: Event[];
  isLoading?: boolean;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
  currentUserId?: number | null;
  pendingDeleteId?: number | null;
};

const formatDate = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const formatDateRange = (startAt: string | null, endAt: string | null): string => {
  const start = formatDate(startAt);
  const end = formatDate(endAt);

  if (start && end) {
    return `${start} — ${end}`;
  }

  if (start) {
    return start;
  }

  return 'Дата не указана';
};

const EventList = ({
  events,
  isLoading = false,
  onEdit,
  onDelete,
  currentUserId,
  pendingDeleteId,
}: EventListProps) => {
  const router = useRouter();

  const handleRowClick = (event: Event) => {
    void router.push(`/events/${event.id}`);
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        Загружаем события…
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-400">
        Пока нет событий. Добавьте первое мероприятие, чтобы начать планирование.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm dark:border-neutral-800">
      <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <th scope="col" className="px-4 py-3 sm:px-6">
              Название
            </th>
            <th scope="col" className="px-4 py-3 sm:px-6">
              Даты
            </th>
            <th scope="col" className="px-4 py-3 sm:px-6">
              Локация
            </th>
            <th scope="col" className="px-4 py-3 sm:px-6">
              Категория
            </th>
            <th scope="col" className="px-4 py-3 text-right sm:px-6">
              Действия
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 bg-white text-sm dark:divide-neutral-800 dark:bg-neutral-950">
          {events.map((event) => {
            const isOwner = currentUserId === event.owner.id;
            return (
              <tr
                key={event.id}
                onClick={() => handleRowClick(event)}
                className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <td className="px-4 py-4 font-medium text-neutral-900 dark:text-neutral-100 sm:px-6">
                  <Link href={`/events/${event.id}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                    {event.title}
                  </Link>
                </td>
                <td className="px-4 py-4 text-neutral-600 dark:text-neutral-300 sm:px-6">
                  {formatDateRange(event.startAt, event.endAt)}
                </td>
                <td className="px-4 py-4 text-neutral-600 dark:text-neutral-300 sm:px-6">
                  {event.location && event.location.trim().length > 0 ? event.location : '—'}
                </td>
                <td className="px-4 py-4 text-neutral-600 dark:text-neutral-300 sm:px-6">
                  {event.category && event.category.trim().length > 0 ? event.category : '—'}
                </td>
                <td className="px-4 py-4 text-right sm:px-6">
                  {isOwner ? (
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onEdit(event);
                        }}
                        className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        disabled={pendingDeleteId === event.id}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onDelete(event);
                        }}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40"
                        disabled={pendingDeleteId === event.id}
                      >
                        Удалить
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400">Только просмотр</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EventList;
