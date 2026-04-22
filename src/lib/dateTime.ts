const JST_TIME_ZONE = "Asia/Tokyo";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function createFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    ...options,
  });
}

const dateFormatter = createFormatter({
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = createFormatter({
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const messageDateTimeFormatter = createFormatter({
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const timeFormatter = createFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

const dateHeaderFormatter = createFormatter({
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const dateKeyFormatter = createFormatter({
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function getJstDateInputParts(date: Date): {
  year: number;
  month: string;
  day: string;
  hour: string;
  minute: string;
} {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

  return {
    year: jstDate.getUTCFullYear(),
    month: padTwoDigits(jstDate.getUTCMonth() + 1),
    day: padTwoDigits(jstDate.getUTCDate()),
    hour: padTwoDigits(jstDate.getUTCHours()),
    minute: padTwoDigits(jstDate.getUTCMinutes()),
  };
}

export function formatDateJst(dateString: string): string {
  return dateFormatter.format(new Date(dateString));
}

export function formatDateTimeJst(dateString: string): string {
  return dateTimeFormatter.format(new Date(dateString));
}

type MessageDateTimeParts = {
  year: string;
  month: string;
  day: string;
  weekday: string;
  hour: string;
  minute: string;
};

function getMessageDateTimeParts(date: Date): MessageDateTimeParts {
  const parts = messageDateTimeFormatter.formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
    day: parts.find((part) => part.type === "day")?.value ?? "",
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    hour: parts.find((part) => part.type === "hour")?.value ?? "",
    minute: parts.find((part) => part.type === "minute")?.value ?? "",
  };
}

export function formatMessageDateTimeJst(
  dateString: string,
  currentDate: Date = new Date(),
): string {
  const target = getMessageDateTimeParts(new Date(dateString));
  const current = getMessageDateTimeParts(currentDate);
  const datePart =
    target.year === current.year
      ? `${target.month}/${target.day}(${target.weekday})`
      : `${target.year}/${target.month}/${target.day}(${target.weekday})`;

  return `${datePart} ${target.hour}:${target.minute}`;
}

export function formatTimeJst(dateString: string): string {
  return timeFormatter.format(new Date(dateString));
}

export function formatDateHeaderJst(dateString: string): string {
  return dateHeaderFormatter.format(new Date(dateString));
}

export function getDateKeyJst(dateString: string): string {
  return dateKeyFormatter.format(new Date(dateString)).replace(/\//g, "-");
}

export function getCurrentJstDateTimeLocal(currentDate = new Date()): string {
  const parts = getJstDateInputParts(currentDate);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function getCurrentJstDate(currentDate = new Date()): string {
  const parts = getJstDateInputParts(currentDate);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
