export const BACKUP_PATTERN = /^\d{8}T\d{6}Z_niedax_generator_pg18\.dump$/u;

export function isProjectBackupFilename(filename: string): boolean {
  return BACKUP_PATTERN.test(filename) && !filename.includes("/") && !filename.includes("\\");
}

export function shouldPrune(ageDays: number, checksumValid: boolean): boolean {
  return checksumValid && ageDays > 28;
}
