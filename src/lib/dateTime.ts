const JST_TIME_ZONE = "Asia/Tokyo";

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

export function formatDateJst(dateString: string): string {
  return dateFormatter.format(new Date(dateString));
}

export function formatDateTimeJst(dateString: string): string {
  return dateTimeFormatter.format(new Date(dateString));
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
