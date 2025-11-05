from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Final, TYPE_CHECKING

from django.conf import settings
from django.db.models import Prefetch, QuerySet
from django.utils import timezone

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    _REPORTLAB_AVAILABLE = True
except ImportError:  # pragma: no cover - выполняется только без reportlab
    colors = None  # type: ignore[assignment]
    A4 = (0, 0)  # type: ignore[assignment]
    pdfmetrics = None  # type: ignore[assignment]
    TTFont = None  # type: ignore[assignment]
    canvas = None  # type: ignore[assignment]
    _REPORTLAB_AVAILABLE = False

if TYPE_CHECKING:
    from reportlab.pdfgen.canvas import Canvas
else:  # pragma: no cover - подсказки типов не нужны во время выполнения
    Canvas = Any  # type: ignore[assignment]

from apps.events.models import Event
from apps.tasks.models import Task, TaskList

_FONT_CANDIDATES_REGULAR: Final[list[Path]] = [
    Path(settings.BASE_DIR) / "apps" / "export" / "fonts" / "Roboto-Regular.ttf",
    Path(settings.BASE_DIR) / "static" / "fonts" / "DejaVuSans.ttf",
    Path(settings.BASE_DIR) / "fonts" / "DejaVuSans.ttf",
    Path(settings.BASE_DIR) / "apps" / "export" / "fonts" / "DejaVuSans.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
    Path(r"C:\Windows\Fonts\arial.ttf"),
]
_FONT_CANDIDATES_BOLD: Final[list[Path]] = [
    Path(settings.BASE_DIR) / "apps" / "export" / "fonts" / "Roboto-Bold.ttf",
    Path(settings.BASE_DIR) / "static" / "fonts" / "DejaVuSans-Bold.ttf",
    Path(settings.BASE_DIR) / "fonts" / "DejaVuSans-Bold.ttf",
    Path(settings.BASE_DIR) / "apps" / "export" / "fonts" / "DejaVuSans-Bold.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    Path("/Library/Fonts/Arial Bold.ttf"),
    Path(r"C:\Windows\Fonts\arialbd.ttf"),
]

_FONT_REGULAR_NAME: str | None = None
_FONT_BOLD_NAME: str | None = None

_TABLE_ROW_HEIGHT: Final[float] = 18.0


@dataclass(frozen=True)
class _TaskSnapshot:
    """Снимок задачи с данными, необходимыми для отчёта."""

    id: int
    title: str
    list_title: str
    assignee_name: str
    status_label: str
    due_date: str


def _register_font(font_name: str, path: Path) -> bool:
    """Пытается зарегистрировать шрифт и сообщает об успехе."""
    try:
        pdfmetrics.registerFont(TTFont(font_name, str(path)))
        return True
    except (OSError, FileNotFoundError):
        return False


def _ensure_fonts() -> tuple[str, str]:
    """Готовит шрифты для кириллического текста с запасным вариантом."""
    if not _REPORTLAB_AVAILABLE:
        raise RuntimeError("ReportLab недоступен. Установите пакет reportlab, чтобы формировать PDF-отчёты.")
    global _FONT_REGULAR_NAME, _FONT_BOLD_NAME

    if _FONT_REGULAR_NAME and _FONT_BOLD_NAME:
        return _FONT_REGULAR_NAME, _FONT_BOLD_NAME

    for candidate in _FONT_CANDIDATES_REGULAR:
        if candidate.is_file() and _register_font("ExportPrimary", candidate):
            _FONT_REGULAR_NAME = "ExportPrimary"
            break
    else:
        _FONT_REGULAR_NAME = "Helvetica"

    for candidate in _FONT_CANDIDATES_BOLD:
        if candidate.is_file() and _register_font("ExportPrimary-Bold", candidate):
            _FONT_BOLD_NAME = "ExportPrimary-Bold"
            break
    else:
        _FONT_BOLD_NAME = "Helvetica-Bold"

    return _FONT_REGULAR_NAME, _FONT_BOLD_NAME


def _event_queryset() -> QuerySet[Event]:
    """Формирует запрос события с задачами и зависимостями."""
    task_queryset = (
        Task.objects.select_related("assignee__user", "list")
        .prefetch_related("depends_on")
        .order_by("list__order", "list_id", "order", "id")
    )
    return (
        Event.objects.select_related("owner")
        .prefetch_related(
            Prefetch(
                "task_lists",
                queryset=TaskList.objects.order_by("order", "id").prefetch_related(
                    Prefetch("tasks", queryset=task_queryset)
                ),
            )
        )
        .only("id", "title", "owner_id")
    )


def _format_datetime(value: datetime | None) -> str:
    """Приводит дату к строке вида 31.12.2025 14:30."""
    if value is None:
        return "—"
    localized = timezone.localtime(value) if timezone.is_aware(value) else value
    return localized.strftime("%d.%m.%Y %H:%M")


def _build_snapshots(tasks: Iterable[Task]) -> list[_TaskSnapshot]:
    """Собирает удобные для отрисовки представления задач."""
    snapshots: list[_TaskSnapshot] = []
    for task in tasks:
        assignee = getattr(task.assignee, "user", None)
        assignee_name = getattr(assignee, "name", None) or getattr(assignee, "email", "—")
        status_label = task.get_status_display()
        due_date = _format_datetime(task.due_at)
        list_title = task.list.title
        snapshots.append(
            _TaskSnapshot(
                id=task.id,
                title=task.title,
                list_title=list_title,
                assignee_name=assignee_name,
                status_label=status_label,
                due_date=due_date,
            )
        )
    return snapshots


def _truncate(text: str, limit: int) -> str:
    """Обрезает строку, чтобы она поместилась в ячейку."""
    if len(text) <= limit:
        return text
    return text[: max(limit - 1, 1)] + "…"


def _draw_header(pdf: Canvas, title: str, generated_at: datetime, font_regular: str, font_bold: str) -> float:
    """Рисует шапку и возвращает вертикальную позицию начала таблицы."""
    width, height = A4
    margin = 40.0
    pdf.setFont(font_bold, 18)
    pdf.drawString(margin, height - margin, title)
    pdf.setFont(font_regular, 11)
    timestamp = timezone.localtime(generated_at) if timezone.is_aware(generated_at) else generated_at
    pdf.drawString(margin, height - margin - 18, f"Дата формирования: {timestamp.strftime('%d.%m.%Y %H:%M')}")
    pdf.setStrokeColor(colors.lightgrey)
    pdf.line(margin, height - margin - 26, width - margin, height - margin - 26)
    return height - margin - 48


def _draw_table(
    pdf: Canvas,
    start_y: float,
    snapshots: list[_TaskSnapshot],
    font_regular: str,
    font_bold: str,
    event_title: str,
    generated_at: datetime,
) -> float:
    """Отрисовывает таблицу задач и возвращает текущую высоту курсора."""
    width, height = A4
    margin_left = 36.0
    margin_bottom = 48.0

    columns = [
        (margin_left, 0.40),
        (margin_left + (width - 2 * margin_left) * 0.40, 0.25),
        (margin_left + (width - 2 * margin_left) * 0.65, 0.20),
        (margin_left + (width - 2 * margin_left) * 0.85, 0.15),
    ]
    header_labels = ("Название", "Исполнитель", "Статус", "Дедлайн")

    def draw_header(y: float) -> float:
        pdf.setFont(font_bold, 11)
        for (x, _), label in zip(columns, header_labels, strict=True):
            pdf.drawString(x, y, label)
        pdf.setStrokeColor(colors.darkgrey)
        pdf.line(margin_left, y - 2, width - margin_left, y - 2)
        return y - _TABLE_ROW_HEIGHT

    y = draw_header(start_y)
    pdf.setFont(font_regular, 10)
    title_column_width = columns[1][0] - columns[0][0]
    max_title_len = max(int(title_column_width // 7), 20)

    for snapshot in snapshots:
        if y <= margin_bottom:
            pdf.showPage()
            y = _draw_header(pdf, event_title, generated_at, font_regular, font_bold)
            y = draw_header(y)
            pdf.setFont(font_regular, 10)

        truncated_title = _truncate(snapshot.title, max_title_len)
        pdf.drawString(columns[0][0], y, truncated_title)
        pdf.drawString(columns[1][0], y, _truncate(snapshot.assignee_name, 24))
        pdf.drawString(columns[2][0], y, _truncate(snapshot.status_label, 20))
        pdf.drawString(columns[3][0], y, snapshot.due_date)
        y -= _TABLE_ROW_HEIGHT

    return y


def generate_event_pdf(event_id: int) -> bytes:
    """Генерирует PDF-отчёт по задачам события."""
    if not _REPORTLAB_AVAILABLE:
        raise RuntimeError("ReportLab недоступен. Установите пакет reportlab, чтобы формировать PDF-отчёты.")
    event = _event_queryset().get(id=event_id)
    all_tasks: list[Task] = []
    for task_list in event.task_lists.all():
        all_tasks.extend(task_list.tasks.all())

    snapshots = _build_snapshots(all_tasks)
    font_regular, font_bold = _ensure_fonts()

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)

    generated_at = timezone.now()
    header_y = _draw_header(pdf, event.title, generated_at, font_regular, font_bold)
    _draw_table(pdf, header_y, snapshots, font_regular, font_bold, event.title, generated_at)

    pdf.save()
    return buffer.getvalue()
