import type { JSX } from 'react';

import type { Event } from '@/types/event';

const mockEvents: Event[] = [
  {
    id: 1,
    title: 'Product Launch Meetup',
    category: 'meetup',
    description: 'Team alignment before the upcoming launch with demos, Q&A, and partner updates.',
    startAt: '2025-11-10T18:00:00+01:00',
    endAt: '2025-11-10T20:00:00+01:00',
    location: 'Berlin, Prenzlauer Allee 45',
    ownerId: 1,
  },
  {
    id: 2,
    title: 'Internal Planning',
    category: 'workshop',
    description: 'Quarterly OKR sync for the product, marketing, and support teams.',
    startAt: '2025-12-01T09:30:00+01:00',
    endAt: '2025-12-01T12:00:00+01:00',
    location: 'Remote (Zoom)',
    ownerId: 2,
  },
  {
    id: 3,
    title: 'Community Breakfast',
    category: 'community',
    description: 'Informal breakfast with community leaders to gather product feedback.',
    startAt: '2025-12-15T08:30:00+01:00',
    endAt: '2025-12-15T10:00:00+01:00',
    location: 'Berlin, Rosenthaler Platz',
    ownerId: 3,
  },
];

function formatDates(event: Event): string {
  const start = event.startAt ? new Date(event.startAt) : null;
  const end = event.endAt ? new Date(event.endAt) : null;

  if (!start) {
    return 'Дата не указана';
  }

  const formatter = new Intl.DateTimeFormat('ru-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const startText = formatter.format(start);

  if (!end) {
    return startText;
  }

  return `${startText} — ${formatter.format(end)}`;
}

function getEventStatus(event: Event): string {
  const now = new Date();
  const start = event.startAt ? new Date(event.startAt) : null;
  const end = event.endAt ? new Date(event.endAt) : null;

  if (!start) {
    return 'Нет даты начала';
  }

  if (start > now) {
    return 'Запланировано';
  }

  if (end && end < now) {
    return 'Завершено';
  }

  return 'В процессе';
}

export default function EventsPage(): JSX.Element {
  return (
    <section className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">Предстоящие события</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Здесь появится список мероприятий, полученных из API. Пока что отображаем несколько примеров для проверки
          интерфейса.
        </p>
      </div>
      <ul className="space-y-4" aria-label="Список событий">
        {mockEvents.map((event) => (
          <li
            key={event.id}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
          >
            <h2 className="text-xl font-medium text-gray-900 dark:text-gray-100">{event.title}</h2>
            <dl className="mt-2 grid gap-2 text-sm text-gray-700 dark:text-gray-300 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-gray-500 dark:text-gray-400">Когда</dt>
                <dd>{formatDates(event)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-500 dark:text-gray-400">Локация</dt>
                <dd>{event.location ?? 'Локация уточняется'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-500 dark:text-gray-400">Категория</dt>
                <dd>{event.category ?? 'Без категории'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-500 dark:text-gray-400">Статус</dt>
                <dd>{getEventStatus(event)}</dd>
              </div>
            </dl>
            {event.description ? (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{event.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
