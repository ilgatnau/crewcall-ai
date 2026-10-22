// Exact commands only: agent-addressed instructions remain ordinary prompts.
export function parseDashboardCommand(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  return /^(?:please )?(?:show|display|list|open)(?: me)? (?:all (?:the )?|the )?agent(?: sessions|s)$/.test(normalized)
    ? 'show-sessions' : null;
}
export async function routeInput(text, { showSessions, submitInstruction }) {
  if (parseDashboardCommand(text) === 'show-sessions') return showSessions();
  return submitInstruction(text);
}
