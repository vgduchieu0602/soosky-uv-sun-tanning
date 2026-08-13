import type {
    TanningRoutineQuery,
    TanningRoutineResult,
} from "../entities/TanningRoutine.js";

export default interface TanningRoutineRepository {
    createRoutine (query: TanningRoutineQuery): Promise<TanningRoutineResult>;
}
