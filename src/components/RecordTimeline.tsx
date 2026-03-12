import type { Record } from "@/types/domain";
import type { MediaUrl } from "@/usecases/recordUseCases";
import { EditableRecordCard } from "@/components/EditableRecordCard";

type RecordTimelineProps = {
  records: Record[];
  conversationId: string;
  mediaUrls?: Map<string, MediaUrl>;
};

export function RecordTimeline({
  records,
  conversationId,
  mediaUrls,
}: RecordTimelineProps) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        トークレコードがまだありません。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <EditableRecordCard
          key={record.id}
          record={record}
          conversationId={conversationId}
          mediaUrl={mediaUrls?.get(record.id)}
        />
      ))}
    </div>
  );
}
