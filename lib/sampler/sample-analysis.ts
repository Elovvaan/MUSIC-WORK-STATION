import { SampleAsset } from "@/lib/types/models";

export function analyzeSample(asset: SampleAsset) {
  return {
    sampleId: asset.id,
    recommendedMode: asset.durationSec > 2 ? "chromatic" : "one_shot",
    rootNote: asset.detectedRootNote ?? "C",
    transientDensity: asset.durationSec < 1 ? "high" : "medium"
  };
}
