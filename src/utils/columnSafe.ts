export const columnSafe = (k: string) => k.replace(/[^a-zA-Z0-9_]/g, "");

export default columnSafe;
