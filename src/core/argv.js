export function parseArgv(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const flag = value.slice(2);
    const normalizedFlag = normalizeFlagName(flag);
    const nextValue = argv[index + 1];
    const flagValue = !nextValue || nextValue.startsWith("--") ? true : nextValue;

    flags[flag] = flagValue;
    flags[normalizedFlag] = flagValue;

    if (flagValue !== true) {
      index += 1;
    }
  }

  return { positionals, flags };
}

function normalizeFlagName(flag) {
  return String(flag).replace(/-([a-z0-9])/gi, (_, letter) => letter.toUpperCase());
}
