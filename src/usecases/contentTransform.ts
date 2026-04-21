import { MY_NAME_PLACEHOLDER } from "@/types/domain";

export function replaceMyNamePlaceholder(
  text: string,
  displayName: string,
): string {
  if (displayName.length === 0) return text;
  return text.replaceAll(MY_NAME_PLACEHOLDER, displayName);
}
