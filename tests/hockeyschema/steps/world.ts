export type World = {
  // Intentionally open — this is a per-scenario bag steps stash arbitrary state in.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export function createWorld(): World {
  return {};
}
