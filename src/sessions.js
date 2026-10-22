// Inspect without adopting sessions, launching agents, or changing readiness.
export async function listAgentSessions(profiles, tmux) {
  const panes = await tmux.list();
  return profiles.map(profile => {
    const matches = panes.filter(pane => pane.session === profile.session);
    const selected = profile.pane ? matches.find(pane => pane.id === profile.pane) : matches.length === 1 ? matches[0] : null;
    const availability = !matches.length ? 'missing'
      : !selected ? (profile.pane ? 'bound-pane-missing' : 'multiple-panes')
      : selected.dead ? 'stopped' : 'running';
    return {
      name: profile.name, session: profile.session, availability,
      pane: selected?.id || null,
      panes: matches.map(({ id, dead, process }) => ({ id, dead, process })),
      attach: matches.length ? 'tmux attach-session -t ' + profile.session : null
    };
  });
}
