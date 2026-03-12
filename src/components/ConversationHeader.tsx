import type { ConversationWithMetadata } from "@/usecases/conversationUseCases";
import { formatDateJst } from "@/lib/dateTime";
import type { IdolGroup } from "@/types/domain";

type ConversationHeaderProps = {
  conversation: ConversationWithMetadata;
};

const idolGroupLabels: Record<IdolGroup, string> = {
  nogizaka: "乃木坂46",
  sakurazaka: "櫻坂46",
  hinatazaka: "日向坂46",
};

function formatPeriod(
  startDate: string,
  endDate: string | null,
): string {
  if (endDate) {
    return `${startDate} 〜 ${endDate}`;
  }
  return `${startDate} 〜 継続中`;
}

export function ConversationHeader({
  conversation,
}: ConversationHeaderProps) {
  const participantNames = conversation.participants
    .map((p) => p.name)
    .join("、");

  return (
    <div>
      <h1 className="text-2xl font-bold">{conversation.title}</h1>
      <div className="mt-3 space-y-1 text-sm text-gray-600">
        <p>
          <span className="font-medium text-gray-700">グループ:</span>{" "}
          {idolGroupLabels[conversation.idolGroup]}
        </p>
        {participantNames && (
          <p>
            <span className="font-medium text-gray-700">参加者:</span>{" "}
            {participantNames}
          </p>
        )}
        <p>
          <span className="font-medium text-gray-700">会話期間:</span>{" "}
          {conversation.activeDays}日
        </p>
        {conversation.activePeriods.length > 0 && (
          <ul className="ml-4 list-disc text-xs text-gray-500">
            {conversation.activePeriods.map((period) => (
              <li key={period.id}>
                {formatPeriod(period.startDate, period.endDate)}
              </li>
            ))}
          </ul>
        )}
        <p>
          <span className="font-medium text-gray-700">作成日:</span>{" "}
          {formatDateJst(conversation.createdAt)}
        </p>
      </div>
    </div>
  );
}
