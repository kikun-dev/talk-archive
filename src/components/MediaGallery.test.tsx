import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MediaGallery } from "./MediaGallery";
import type { ConversationParticipant, Record } from "@/types/domain";
import type { MediaUrl } from "@/usecases/recordUseCases";

const participants: ConversationParticipant[] = [
  {
    id: "part-1",
    conversationId: "conv-1",
    name: "メンバーA",
    sortOrder: 0,
    thumbnailPath: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const imageRecord: Record = {
  id: "rec-img-1",
  conversationId: "conv-1",
  recordType: "image",
  title: "写真タイトル",
  content: null,
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-01T10:00:00+09:00",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const videoRecord: Record = {
  id: "rec-vid-1",
  conversationId: "conv-1",
  recordType: "video",
  title: null,
  content: null,
  hasAudio: true,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-02T14:00:00+09:00",
  position: 1,
  createdAt: "2026-01-02T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

const audioRecord: Record = {
  id: "rec-aud-1",
  conversationId: "conv-1",
  recordType: "audio",
  title: "音声メモ",
  content: null,
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-03T09:00:00+09:00",
  position: 2,
  createdAt: "2026-01-03T00:00:00Z",
  updatedAt: "2026-01-03T00:00:00Z",
};

const allRecords = [imageRecord, videoRecord, audioRecord];

const mediaUrls: { [recordId: string]: MediaUrl } = {
  "rec-img-1": { url: "https://example.com/img.jpg", mimeType: "image/jpeg" },
  "rec-vid-1": { url: "https://example.com/vid.mp4", mimeType: "video/mp4" },
  "rec-aud-1": { url: "https://example.com/aud.mp3", mimeType: "audio/mpeg" },
};

describe("MediaGallery", () => {
  it("renders all tabs", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={allRecords}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    expect(screen.getByRole("button", { name: "すべて" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画像" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "動画" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "音声" })).toBeInTheDocument();
  });

  it("shows all media records by default", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={allRecords}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("filters to images when tab is clicked", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={allRecords}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "画像" }));

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("写真タイトル")).toBeInTheDocument();
  });

  it("filters to videos when tab is clicked", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={allRecords}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "動画" }));

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("filters to audio when tab is clicked", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={allRecords}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "音声" }));

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("音声メモ")).toBeInTheDocument();
  });

  it("shows empty state when no media records", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={[]}
        participants={participants}
        mediaUrls={{}}
      />,
    );

    expect(
      screen.getByText("メディアレコードがありません。"),
    ).toBeInTheDocument();
  });

  it("shows tab-specific empty state", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={[imageRecord]}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "動画" }));

    expect(
      screen.getByText("動画レコードがありません。"),
    ).toBeInTheDocument();
  });

  it("links to conversation with recordId", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={[imageRecord]}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/conversations/conv-1?recordId=rec-img-1",
    );
  });

  it("renders record type badges", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={allRecords}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    // Each type label appears twice: once in the tab and once in the badge
    expect(screen.getAllByText("画像")).toHaveLength(2);
    expect(screen.getAllByText("動画")).toHaveLength(2);
    expect(screen.getAllByText("音声")).toHaveLength(2);
  });

  it("renders participant name", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={[imageRecord]}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    expect(screen.getByText("メンバーA")).toBeInTheDocument();
  });

  it("shows unknown for missing participant", () => {
    const record = { ...imageRecord, speakerParticipantId: "unknown-id" };
    render(
      <MediaGallery
        conversationId="conv-1"
        records={[record]}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    expect(screen.getByText("不明")).toBeInTheDocument();
  });

  it("renders record title when present", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={[imageRecord]}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    expect(screen.getByText("写真タイトル")).toBeInTheDocument();
  });

  it("uses responsive grid layout for media cards", () => {
    render(
      <MediaGallery
        conversationId="conv-1"
        records={allRecords}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    expect(screen.getByTestId("media-gallery-grid")).toHaveClass(
      "grid",
      "grid-cols-1",
      "sm:grid-cols-2",
      "xl:grid-cols-3",
    );
  });

  it("uses contain fit for image and video previews to avoid cropping", () => {
    const { container } = render(
      <MediaGallery
        conversationId="conv-1"
        records={[imageRecord, videoRecord]}
        participants={participants}
        mediaUrls={mediaUrls}
      />,
    );

    const image = screen.getByAltText("写真タイトル");
    const video = container.querySelector("video");

    expect(image).toHaveClass("object-contain");
    expect(video).toHaveClass("object-contain");
  });
});
