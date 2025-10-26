import type { Event } from '../../types/event';

const mockEvents: Event[] = [
  {
    id: 1,
    title: 'Product Launch Meetup',
    category: 'meetup',
    description: 'Обсуждение деталей запуска с партнёрами.',
    startAt: '2025-11-10T18:00:00+01:00',
    endAt: '2025-11-10T20:00:00+01:00',
    location: 'Берлин, Prenzlauer Allee 45',
    ownerId: 1,
  },
  {
    id: 2,
    title: 'Internal Planning',
    category: 'workshop',
    description: 'Рабочая сессия команды организаторов.',
    startAt: '2025-12-01T09:30:00+01:00',
    endAt: '2025-12-01T12:00:00+01:00',
    location: 'Remote (Zoom)',
    ownerId: 2,
  },
  {
    id: 3,
    title: 'Community Breakfast',
    category: 'community',
    description: 'Неформальная встреча участников сообщества.',
    startAt: '2025-12-15T08:30:00+01:00',
    endAt: '2025-12-15T10:00:00+01:00',
    location: 'Берлин, Rosenthaler Platz',
    ownerId: 3,
  },
];

function formatDates(event: Event): string {
  const start = event.startAt ? new Date(event.startAt) : null;
  const end = event.endAt ? new Date(event.endAt) : null;
  if (!start) {
    return 'Дата уточняется';
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
    return 'Планируется';
  }

  if (start > now) {
    return 'Запланировано';
  }

  if (end && end < now) {
    return 'Завершено';
  }

  return 'В процессе';
}

export default function EventsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-gray-900 mb-6">Предстоящие события</h1>
      <p className="text-gray-600 mb-8">
        Ниже приведён тестовый список, чтобы оценить визуализацию страницы до подключения API.
      </p>
      <ul className="space-y-4" aria-label="Список событий">
        {mockEvents.map((event) => (
          <li
            key={event.id}
            className="rounded-lg border border-gray-200 bg-white shadow-sm p-6 transition hover:shadow-md"
          >
            <h2 className="text-xl font-medium text-gray-900">{event.title}</h2>
            <dl className="mt-2 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-gray-500">Даты</dt>
                <dd>{formatDates(event)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-500">Локация</dt>
                <dd>{event.location || 'Уточняется'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-500">Категория</dt>
                <dd>{event.category || 'Без категории'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-500">Статус</dt>
                <dd>{getEventStatus(event)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
