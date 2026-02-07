
import { Env, SecurityAssessment } from "../types";

export abstract class BaseAgent {
    protected env: Env;
    public abstract name: string;

    constructor(env: Env) {
        this.env = env;
    }

    /**
     * Core analysis method that all agents must implement.
     * Takes a raw string payload and returns a structued assessment.
     */
    abstract analyze(payload: string): Promise<SecurityAssessment>;
}
