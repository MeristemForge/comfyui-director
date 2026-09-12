export const videoModelProfiles = {
  H3: {
    label: "H3",
    workflowFamily: "minimax-h3",
    videoNodePrefix: "MiniMaxH3",
    modes: ["T2VA", "I2VA", "R2VA"],
    images: 9,
    videos: 3,
    audios: 3,
    sampling: {
      standardSteps: 20,
      defaultLoraSteps: 8,
    },
    resolutions: [
      "608 × 352",
      "736 × 416",
      "864 × 480",
      "960 × 544",
      "1056 × 608",
      "1152 × 640",
      "1216 × 672",
      "1280 × 736",
      "1344 × 768",
    ],
  },
} as const;

export type VideoModelId = keyof typeof videoModelProfiles;
export const defaultVideoModel = Object.keys(videoModelProfiles)[0] as VideoModelId;

export function isVideoModelId(value: unknown): value is VideoModelId {
  return typeof value === "string" && value in videoModelProfiles;
}
export function stepsForModelFile(model: VideoModelId, loraFile: string): number {
  if (!loraFile.trim()) return videoModelProfiles[model].sampling.standardSteps;
  const match = loraFile.match(/(?:^|[_-])(\d+)(?:step|steps)(?:[_-]|\.|$)/i);
  return match ? Number(match[1]) : videoModelProfiles[model].sampling.defaultLoraSteps;
}
