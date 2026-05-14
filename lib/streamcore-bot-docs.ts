/**
 * Built-in triggers handled by `BotEngineProvider` even when they are not rows in `BotCommand`.
 * A custom command with the same trigger overrides the built-in.
 */
export const BUILTIN_BOT_COMMANDS: { trigger: string; description: string }[] = [
  {
    trigger: "help",
    description: "Lists your custom command triggers plus built-ins. Short cooldown so chat can spam it safely."
  },
  {
    trigger: "commands",
    description: "Alias of help — same reply."
  },
  {
    trigger: "sr",
    description:
      "Song request: pass a Spotify track link or search text (see Song Requests). Role limits follow your Song Request settings."
  },
  {
    trigger: "volume",
    description:
      "Reads or sets Spotify playback volume (0–100). Examples: `!volume`, `!volume 50`, `!volume 50%`. Needs an active, remotely controllable Spotify device. Who may use it is set under Song requests → “Who can use !volume” (same role rules as song requests)."
  }
];

/** Shown on the StreamCore Bot page as a quick reference (must match engine behaviour). */
export const BOT_TEMPLATE_VARIABLES_DOC = `Template variables (use exactly as written in the “Bot message” field):

\${user}
  Replaced with the display name of the chatter who ran the command.

\${target}
  Replaced with the first word after the trigger. Leading @ is stripped (e.g. “!hug @SomeUser” → SomeUser).
  If there is no argument, it falls back to \${user} (self-target).

\${streamer}
  Replaced with your channel’s display name (the broadcaster you have selected in StreamCore).

\${random:min-max}
  Replaced with a random integer between min and max (inclusive). Either order works; values are integers.
  Example: “Roll: \${random:1-20}” → “Roll: 14”

Notes:
  - Substitutions are one pass only — a chatter cannot nest tricks to re-expand variables inside names.
  - Keep messages under Twitch’s chat length; very long templates may be clipped by Twitch.`;
