/**
 * Minimal IRCv3 message parser for Twitch chat (wss://irc-ws.chat.twitch.tv:443).
 *
 * Twitch chat speaks a tweaked IRC dialect: most lines have an `@tag1=v1;tag2=v2` prefix
 * (when the `twitch.tv/tags` capability is negotiated), then optionally a `:nick!user@host`
 * source, then a command (`PRIVMSG`, `PING`, `NOTICE`, `CLEARCHAT`, …), space-separated
 * params, and a single optional `:trailing` argument that holds the chat text.
 *
 * Lines are terminated by `\r\n`. A single WebSocket frame can carry MULTIPLE lines, so
 * callers must split on `\r\n` before invoking `parseIrcLine`.
 *
 * @see https://dev.twitch.tv/docs/irc/
 */

export type IrcMessage = {
  tags: Record<string, string> | null;
  /** Raw IRC source, e.g. `nick!user@nick.tmi.twitch.tv` — null when the server omits it. */
  prefix: string | null;
  /** `nick` extracted from the prefix (chat author for PRIVMSG). */
  nick: string | null;
  /** IRC command verb or numeric (e.g. `PRIVMSG`, `001`, `PING`, `CLEARCHAT`). */
  command: string;
  /** Space-separated middle params, in order (e.g. `["#channel"]` for PRIVMSG). */
  params: string[];
  /** Final `:trailing` argument — the chat message body for PRIVMSG. */
  trailing: string | null;
};

/**
 * Decode an IRCv3 tag value back to its raw form.
 * `\:` → `;`, `\s` → space, `\r` → CR, `\n` → LF, `\\` → `\`. Order matters: handle the
 * backslash escape last so we don't double-unescape.
 */
function unescapeTagValue(v: string): string {
  let out = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== "\\" || i + 1 >= v.length) {
      out += v[i];
      continue;
    }
    const next = v[i + 1];
    if (next === ":") out += ";";
    else if (next === "s") out += " ";
    else if (next === "r") out += "\r";
    else if (next === "n") out += "\n";
    else if (next === "\\") out += "\\";
    else out += next;
    i++;
  }
  return out;
}

export function parseIrcLine(line: string): IrcMessage | null {
  if (!line) return null;
  let rest = line;
  let tags: Record<string, string> | null = null;
  let prefix: string | null = null;
  let nick: string | null = null;

  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    if (sp < 0) return null;
    const tagStr = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
    tags = {};
    for (const kv of tagStr.split(";")) {
      const eq = kv.indexOf("=");
      if (eq < 0) tags[kv] = "";
      else tags[kv.slice(0, eq)] = unescapeTagValue(kv.slice(eq + 1));
    }
  }

  if (rest.startsWith(":")) {
    const sp = rest.indexOf(" ");
    if (sp < 0) return null;
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
    const bang = prefix.indexOf("!");
    nick = bang > 0 ? prefix.slice(0, bang) : prefix;
  }

  // Trailing arg starts at the first ` :` or at the very start if the entire rest begins with `:`.
  let trailing: string | null = null;
  let head = rest;
  const sepIdx = rest.indexOf(" :");
  if (sepIdx >= 0) {
    head = rest.slice(0, sepIdx);
    trailing = rest.slice(sepIdx + 2);
  } else if (rest.startsWith(":")) {
    head = "";
    trailing = rest.slice(1);
  }

  const parts = head.split(" ").filter(Boolean);
  if (parts.length === 0 && trailing == null) return null;
  const command = parts[0] ?? "";
  const params = parts.slice(1);
  return { tags, prefix, nick, command, params, trailing };
}

/** Strip control chars that would break IRC framing (`\r`, `\n`, `\0`) from an outgoing message. */
export function sanitizeChatText(text: string): string {
  return text.replace(/[\r\n\0]/g, " ").trim();
}
