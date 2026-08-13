import type { GroundingMetadata, SkinScanData, SkinTone } from "./SkinScanResult.js";

export type DesiredSkin = SkinTone;

export interface TanningRoutineDay {
    day: number;
    phase: string;
    activities: string[];
}

export interface TanningRoutineData {
    routineName: string;
    totalDays: number;
    targetGoal: string;
    dailySchedule: TanningRoutineDay[];
}

export interface TanningRoutineError {
    errorCode: "ERR-01" | "ERR-99";
    suggestion: string;
}

export interface TanningRoutineQuery {
    currentSkin: SkinScanData;
    desiredSkin: DesiredSkin;
}

export type TanningRoutineResult =
    | { data: TanningRoutineData; grounding?: GroundingMetadata; errmsg?: never }
    | { errmsg: TanningRoutineError; data?: never; grounding?: never };
