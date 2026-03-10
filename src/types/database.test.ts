import { describe, it, expectTypeOf } from "vitest";
import type { Database } from "./database";
import type {
  Source,
  Conversation,
  Record,
  Attachment,
  RecordType,
} from "./domain";

type Tables = Database["public"]["Tables"];
type SourceRow = Tables["sources"]["Row"];
type ConversationRow = Tables["conversations"]["Row"];
type RecordRow = Tables["records"]["Row"];
type AttachmentRow = Tables["attachments"]["Row"];
type DbRecordType = Database["public"]["Enums"]["record_type"];

describe("database types", () => {
  describe("Source", () => {
    it("Row has the expected columns", () => {
      expectTypeOf<SourceRow>().toHaveProperty("id");
      expectTypeOf<SourceRow>().toHaveProperty("user_id");
      expectTypeOf<SourceRow>().toHaveProperty("name");
      expectTypeOf<SourceRow>().toHaveProperty("created_at");
      expectTypeOf<SourceRow>().toHaveProperty("updated_at");
    });

    it("Row column types match domain types", () => {
      expectTypeOf<SourceRow["id"]>().toEqualTypeOf<Source["id"]>();
      expectTypeOf<SourceRow["user_id"]>().toEqualTypeOf<Source["userId"]>();
      expectTypeOf<SourceRow["name"]>().toEqualTypeOf<Source["name"]>();
    });
  });

  describe("Conversation", () => {
    it("Row has the expected columns", () => {
      expectTypeOf<ConversationRow>().toHaveProperty("id");
      expectTypeOf<ConversationRow>().toHaveProperty("user_id");
      expectTypeOf<ConversationRow>().toHaveProperty("source_id");
      expectTypeOf<ConversationRow>().toHaveProperty("title");
      expectTypeOf<ConversationRow>().toHaveProperty("created_at");
      expectTypeOf<ConversationRow>().toHaveProperty("updated_at");
    });

    it("Row column types match domain types", () => {
      expectTypeOf<ConversationRow["id"]>().toEqualTypeOf<
        Conversation["id"]
      >();
      expectTypeOf<ConversationRow["user_id"]>().toEqualTypeOf<
        Conversation["userId"]
      >();
      expectTypeOf<ConversationRow["source_id"]>().toEqualTypeOf<
        Conversation["sourceId"]
      >();
      expectTypeOf<ConversationRow["title"]>().toEqualTypeOf<
        Conversation["title"]
      >();
    });
  });

  describe("Record", () => {
    it("Row has the expected columns", () => {
      expectTypeOf<RecordRow>().toHaveProperty("id");
      expectTypeOf<RecordRow>().toHaveProperty("conversation_id");
      expectTypeOf<RecordRow>().toHaveProperty("record_type");
      expectTypeOf<RecordRow>().toHaveProperty("title");
      expectTypeOf<RecordRow>().toHaveProperty("content");
      expectTypeOf<RecordRow>().toHaveProperty("has_audio");
      expectTypeOf<RecordRow>().toHaveProperty("position");
      expectTypeOf<RecordRow>().toHaveProperty("created_at");
      expectTypeOf<RecordRow>().toHaveProperty("updated_at");
    });

    it("Row column types match domain types", () => {
      expectTypeOf<RecordRow["id"]>().toEqualTypeOf<Record["id"]>();
      expectTypeOf<RecordRow["conversation_id"]>().toEqualTypeOf<
        Record["conversationId"]
      >();
      expectTypeOf<RecordRow["title"]>().toEqualTypeOf<Record["title"]>();
      expectTypeOf<RecordRow["content"]>().toEqualTypeOf<Record["content"]>();
      expectTypeOf<RecordRow["has_audio"]>().toEqualTypeOf<
        Record["hasAudio"]
      >();
      expectTypeOf<RecordRow["position"]>().toEqualTypeOf<
        Record["position"]
      >();
    });
  });

  describe("Attachment", () => {
    it("Row has the expected columns", () => {
      expectTypeOf<AttachmentRow>().toHaveProperty("id");
      expectTypeOf<AttachmentRow>().toHaveProperty("record_id");
      expectTypeOf<AttachmentRow>().toHaveProperty("file_path");
      expectTypeOf<AttachmentRow>().toHaveProperty("mime_type");
      expectTypeOf<AttachmentRow>().toHaveProperty("file_size");
      expectTypeOf<AttachmentRow>().toHaveProperty("created_at");
    });

    it("Row column types match domain types", () => {
      expectTypeOf<AttachmentRow["id"]>().toEqualTypeOf<Attachment["id"]>();
      expectTypeOf<AttachmentRow["record_id"]>().toEqualTypeOf<
        Attachment["recordId"]
      >();
      expectTypeOf<AttachmentRow["file_path"]>().toEqualTypeOf<
        Attachment["filePath"]
      >();
      expectTypeOf<AttachmentRow["mime_type"]>().toEqualTypeOf<
        Attachment["mimeType"]
      >();
      expectTypeOf<AttachmentRow["file_size"]>().toEqualTypeOf<
        Attachment["fileSize"]
      >();
    });
  });

  describe("record_type enum", () => {
    it("matches RecordType domain type", () => {
      expectTypeOf<DbRecordType>().toEqualTypeOf<RecordType>();
    });
  });
});
