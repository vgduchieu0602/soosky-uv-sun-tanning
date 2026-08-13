import type {
    TanningRoutineQuery,
    TanningRoutineResult,
} from "../../domain/entities/TanningRoutine.js";
import type TanningRoutineRepository from "../../domain/repositories/ITanningRoutineRepository.js";

export default class CreateTanningRoutineUseCase {
    public constructor (private readonly _tanningRoutineRepository: TanningRoutineRepository) {}

    public async execute (query: TanningRoutineQuery): Promise<TanningRoutineResult> {
        return this._tanningRoutineRepository.createRoutine(query);
    }
}
