export type SkillGuardErrorCode = 'INVALID_BUNDLE' | 'RULES_UNAVAILABLE' | 'GATE1_TIMEOUT';

export class SkillGuardError extends Error {
  readonly code: SkillGuardErrorCode;

  constructor(code: SkillGuardErrorCode, message: string) {
    super(message);
    this.name = 'SkillGuardError';
    this.code = code;
  }
}

export const isSkillGuardError = (error: unknown): error is SkillGuardError => {
  return error instanceof SkillGuardError;
};
