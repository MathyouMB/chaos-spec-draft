export const runtimeState = { hooksArmed: false, chaosFile: "" };
export const markHooksArmed = (path: string) => {
  runtimeState.hooksArmed = true;
  runtimeState.chaosFile = path;
};
