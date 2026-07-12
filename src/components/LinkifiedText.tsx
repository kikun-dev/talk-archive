import { Fragment } from "react";
import { splitTextByUrls } from "@/usecases/contentTransform";

type LinkifiedTextProps = {
  text: string;
};

export function LinkifiedText({ text }: LinkifiedTextProps) {
  const segments = splitTextByUrls(text);

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "url" ? (
          <a
            key={index}
            href={segment.value}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-blue-600 underline"
          >
            {segment.value}
          </a>
        ) : (
          <Fragment key={index}>{segment.value}</Fragment>
        ),
      )}
    </>
  );
}
