import Image from "next/image";
import type { Record, RecordType } from "@/types/domain";
import type { MediaUrl } from "@/usecases/recordUseCases";

type RecordCardProps = {
  record: Record;
  mediaUrl?: MediaUrl;
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

function MediaDisplay({
  record,
  mediaUrl,
}: {
  record: Record;
  mediaUrl: MediaUrl;
}) {
  switch (record.recordType) {
    case "image":
      return (
        <div className="mt-2">
          <Image
            src={mediaUrl.url}
            alt={record.title ?? "画像"}
            unoptimized
            width={480}
            height={320}
            className="max-h-80 w-auto rounded border border-gray-200 object-contain"
          />
        </div>
      );
    case "video":
      return (
        <div className="mt-2">
          <video
            controls
            className="max-h-80 w-full rounded border border-gray-200"
          >
            <source src={mediaUrl.url} type={mediaUrl.mimeType} />
          </video>
        </div>
      );
    case "audio":
      return (
        <div className="mt-2">
          <audio controls className="w-full">
            <source src={mediaUrl.url} type={mediaUrl.mimeType} />
          </audio>
        </div>
      );
    default:
      return null;
  }
}

export function RecordCard({ record, mediaUrl }: RecordCardProps) {
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
      {mediaUrl && <MediaDisplay record={record} mediaUrl={mediaUrl} />}
    </div>
  );
}
