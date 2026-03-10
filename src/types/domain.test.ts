import { describe, expect, it } from "vitest";
import { IdolGroup, RecordType } from "./domain";
import type {
  Attachment,
  Conversation,
  ConversationActivePeriod,
  Record,
  Source,
} from "./domain";

describe("RecordType", () => {
  it("has all expected values", () => {
    expect(RecordType.TEXT).toBe("text");
    expect(RecordType.IMAGE).toBe("image");
    expect(RecordType.VIDEO).toBe("video");
    expect(RecordType.AUDIO).toBe("audio");
  });

  it("has exactly 4 types", () => {
    const values = Object.values(RecordType);
    expect(values).toHaveLength(4);
  });
});

describe("IdolGroup", () => {
  it("has all expected values", () => {
    expect(IdolGroup.NOGIZAKA).toBe("nogizaka");
    expect(IdolGroup.SAKURAZAKA).toBe("sakurazaka");
    expect(IdolGroup.HINATAZAKA).toBe("hinatazaka");
  });
});

describe("domain types", () => {
  it("allows valid Conversation", () => {
    const conversation: Conversation = {
      id: "conv-1",
      userId: "user-1",
      sourceId: null,
      idolGroup: IdolGroup.NOGIZAKA,
      coverImagePath: null,
      title: "テスト会話",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(conversation.title).toBe("テスト会話");
    expect(conversation.sourceId).toBeNull();
  });

  it("allows valid ConversationActivePeriod", () => {
    const period: ConversationActivePeriod = {
      id: "period-1",
      conversationId: "conv-1",
      startDate: "2026-01-01",
      endDate: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(period.endDate).toBeNull();
  });

  it("allows valid Record with text type", () => {
    const record: Record = {
      id: "rec-1",
      conversationId: "conv-1",
      recordType: RecordType.TEXT,
      title: null,
      content: "テスト内容",
      hasAudio: false,
      position: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(record.recordType).toBe("text");
    expect(record.content).toBe("テスト内容");
  });

  it("allows valid Source", () => {
    const source: Source = {
      id: "src-1",
      userId: "user-1",
      name: "LINE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(source.name).toBe("LINE");
  });

  it("allows valid Attachment", () => {
    const attachment: Attachment = {
      id: "att-1",
      recordId: "rec-1",
      filePath: "user-1/conv-1/rec-1/image.png",
      mimeType: "image/png",
      fileSize: 1024,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(attachment.mimeType).toBe("image/png");
  });
});
