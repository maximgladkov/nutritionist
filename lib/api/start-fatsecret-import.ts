// On its own, away from the dependencies the agent shares: eve refuses to build in the workflow SDK.
export async function startFatSecretImport(userId: string): Promise<void> {
  const [{ start }, { fatSecretImportWorkflow }] = await Promise.all([
    import("workflow/api"),
    import("../../workflows/fatsecret-import.ts"),
  ]);
  await start(fatSecretImportWorkflow, [userId]);
}
