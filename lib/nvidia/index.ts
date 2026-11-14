/** NVIDIA NIM client layer — the only place in the app that talks to a model. Server-only. */
export { NvidiaClient, NvidiaError, getNvidiaClient, type NvidiaResult } from "@/lib/nvidia/client";
export { chat, chatJson, extractJson, stripThinking, type ChatMessage, type ChatOptions } from "@/lib/nvidia/chat";
export { cosine, embed, rankBySimilarity, rankVectors, type InputType, type Ranked } from "@/lib/nvidia/embed";
export { parseSafety, safetyCheck, type SafetyVerdict } from "@/lib/nvidia/safety";
export { askImage, askImageJson, imageToText, toDataUrl, type ImageMime } from "@/lib/nvidia/vision";
export { EMBED_DIMENSIONS, MODELS, resolveModel, type ModelRole } from "@/lib/nvidia/config";
