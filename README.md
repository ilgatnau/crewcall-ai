# Named Agents

A Node.js prototype for routing spoken or typed instructions to named coding agents in macOS tmux sessions. Includes a local browser dashboard and CLI. Requires Node.js 22+.

## Try without tmux

```sh
npm install
npm test
npm run demo
```

Open http://127.0.0.1:3210 (use that exact address). Demo mode simulates sessions and delivery; it does not execute any instructions. Send `Agent Thomas, run the tests`, then click **Confirm ready / next** to simulate delivery. Send another instruction while Thomas is busy, then confirm readiness again to advance the queue.

## Run on macOS

Install Node.js 22+, tmux (`brew install tmux`), and your coding-agent CLI. Authenticate the CLI separately and check it works from your shell.

```sh
cp config.example.json config.local.json
# Edit project directories, names, and launch commands first.
npm start
```

Run `npm install` before starting. No compilation step is needed. Agent commands are executable/argument arrays, not arbitrary shell snippets. `~` is supported at the start of project paths. Each profile must use a distinct tmux session. Do not commit local configuration or credentials.

1. Open http://127.0.0.1:3210.
2. Send `Agent Thomas, investigate the failing tests`.
3. If missing, the app creates a detached session and launches the configured executable. The first instruction waits in its queue.
4. In Terminal.app or iTerm2 run `tmux attach-session -t agent-thomas`. Move that window to any monitor. Open separate windows for other agents.
5. Inspect the agent, complete any login/trust prompts, and confirm that it is waiting for input. Click **Confirm ready / next** to deliver one queued instruction.
6. After it finishes and is ready for another instruction, confirm readiness again. Confirmation can deliver the next queued instruction immediately.

Closing the dashboard or terminal window does not intentionally stop agents. Detach from tmux with Control-B then D. The app does not dismiss agent approval prompts or claim that a sent instruction completed successfully.

## Existing sessions

Set a profile's `session` to its existing tmux session name. Single-pane sessions are discovered automatically on the first instruction. For a session with multiple panes, find the intended agent pane:

```sh
tmux list-panes -a -F '#{session_name} #{pane_id} #{pane_current_command}'
```

Set `pane` to its ID, such as `%3`, then restart the server. Inspect the pane and confirm readiness before delivery: the app cannot identify arbitrary running programs reliably. A missing explicit pane binding will not silently fall back to a different pane.

If a process has exited, inspect/restart it manually in tmux. You can use `tmux respawn-pane -t %3` to rerun the pane's original command after inspecting it. Automatic restart is not implemented. Do not kill a session containing work just to clear an error.

## Voice

Click **Dictate**, allow microphone access, speak the full name-prefixed instruction, review the transcript, and click **Send instruction**. Browser Web Speech API support varies; use a compatible browser or macOS dictation in the editor. Browser recognition may send audio to the browser vendor's service. Local/offline transcription, always-on listening, and a global push-to-talk shortcut are not implemented.

## CLI

With the server running:

```sh
npm run agent -- list
npm run agent -- say "Agent Thomas, run the tests"
npm run agent -- ready Thomas
npm run agent -- clear Thomas
```

`clear` discards pending instructions; it does not interrupt a running agent. If delivery failed partway, inspect the terminal for partially entered text before clearing and confirming readiness. The app blocks automatic retry to avoid duplicate submissions.

## Architecture

- `src/supervisor.js`: name resolution, profile validation, per-agent serialization, session inspection, queues, and readiness gates.
- `src/tmux.js`: argument-based tmux process adapter and simulated backend.
- `src/server.js`: loopback-only HTTP API, same-origin checks, per-run request token, and static dashboard.
- `src/cli.js`: client for the local API.
- `public/`: responsive dashboard and optional browser dictation.

The server binds to 127.0.0.1, rejects unexpected Host/Origin headers, and requires a per-run token for mutations. It is a local tool, not a remotely exposed service or protection against other processes running as your user. Keep it off public interfaces.

## Current scope and next steps

This is a runnable foundation, not a packaged menu bar app. Queues and status are held in memory and are lost when the Node process restarts; tmux sessions persist. Dashboard state reflects this server's actions and does not continuously monitor external process changes. Sending and readiness confirmation re-inspect panes. Readiness/idle detection is manual, not inferred from arbitrary terminal text. Submission uses literal tmux input followed by Enter; compatibility must be checked with your CLI's input behavior.

Next steps are coding-agent-specific readiness/completion adapters, durable queues, native macOS microphone/hotkey support, terminal opening/window placement, and optional desktop packaging. The supervisor and tmux boundaries leave room for a later WSL adapter.

## Validation

`npm test` covers routing, duplicate startup prevention, existing-session adoption, ambiguous panes, failed delivery, stopped agents, and invalid input. The implementation was checked in a Linux workspace without tmux. Real macOS tmux sessions, browser microphone behavior, and individual coding-agent CLIs still require integration testing on your Mac.

## Agent responses and speech

The server adds a CrewCall response contract to every delivered instruction, including the absolute Node/CLI reporting command. The agent must support executing shell commands and follow this contract; arbitrary terminal output is not scraped. Existing sessions receive the contract with their next instruction.

To report a response manually, pipe JSON to the CLI while the server is running:

```sh
printf '%s' '{"text":"Full explanation and test results.","voice":"The task is complete. All tests pass."}' | npm run agent -- respond Thomas
```

Use `text` alone for progress. Each report replaces the displayed text; `"append":true` appends a chunk (up to 16000 characters total). To finish, send the complete written response with a separate `voice` summary: one or two sentences, at most 35 words and 300 characters. Reporting does not confirm readiness or advance the instruction queue. Responses are held in memory; only the latest report per agent is retained. Text updates appear with the dashboard's 2.5-second polling interval rather than token-by-token streaming.

Enable **Speak new agent summaries** for automatic playback, or click **Play voice** on a response. Speech is queued across agents, and **Stop voice** cancels playback and queued speech. Browser autoplay rules may require clicking Play voice. In demo mode, **Simulate response** exercises reporting and speech without a real agent.

Speech uses the Node.js library `@sefinek/google-tts-api` and Google's online translation speech service, without an API key. Only the voice summary is sent for synthesis. Internet access is required; provider availability and limits apply. Audio is generated on request and played in the browser, so the WSL host needs no audio device. Provider failures leave the written response available and can be retried with Play voice.

## Voice command: show all agent sessions

Click **Dictate** and say **“show all agent sessions”**. The dashboard immediately displays every configured agent, its tmux session, actual pane availability, pane IDs and processes, and an attach command for existing sessions. **“List agent sessions”**, **“display all agent sessions”**, and **“show all agents”** also work. The same commands can be typed and sent, or use the **Show all agent sessions** button.

This command only inspects sessions; it does not launch agents, send prompts, or confirm readiness. Missing sessions are included. Multi-pane and missing bound-pane cases are identified. Unconfigured tmux sessions are excluded. Use **Refresh sessions** to inspect again. In demo mode, session information is simulated. Agent-addressed instructions still require review and sending as usual.
