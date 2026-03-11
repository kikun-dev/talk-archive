import type { Record } from "@/types/domain";
import { RecordCard } from "@/components/RecordCard";

type RecordTimelineProps = {
  records: Record[];
};

export function RecordTimeline({ records }: RecordTimelineProps) {
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
        <RecordCard key={record.id} record={record} />
      ))}
    </div>
  );
}
