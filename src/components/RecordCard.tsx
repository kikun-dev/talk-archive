import type { Record, RecordType } from "@/types/domain";

type RecordCardProps = {
  record: Record;
};

const recordTypeLabels: { [K in RecordType]: { icon: string; label: string } } = {
  text: { icon: "T", label: "テキスト" },
  image: { icon: "I", label: "画像" },
  video: { icon: "V", label: "動画" },
  audio: { icon: "A", label: "音声" },
};

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecordCard({ record }: RecordCardProps) {
  const typeInfo = recordTypeLabels[record.recordType];

  return (
    <div className="rounded border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-600"
          title={typeInfo.label}
        >
          {typeInfo.icon}
        </span>
        {record.title && (
          <span className="text-sm font-medium">{record.title}</span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {formatTimestamp(record.createdAt)}
        </span>
      </div>
      {record.content && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
          {record.content}
        </p>
      )}
    </div>
  );
}
