import { insertRun, updateRun } from "./store.js";

export function createRunLogger(dbFile) {
  return {
    startRun({ command, input, metadata }) {
      return insertRun(dbFile, {
        command,
        input,
        metadata
      });
    },
    finishRun(id, payload) {
      updateRun(dbFile, id, payload);
    }
  };
}
