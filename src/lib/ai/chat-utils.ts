export type ChatTurn = { role: 'user' | 'assistant'; content: string }

// The Anthropic API requires strict user/assistant alternation. A
// synthetic framing turn (always 'user') prepended ahead of real history
// can create two consecutive 'user' turns if the history's first real
// turn is also 'user' -- the normal case. Coalescing consecutive
// same-role turns keeps this safe regardless of how the history is
// shaped. Shared by every multi-turn AI chat feature in this codebase
// (support-chat.ts, expert-agent-chat.ts).
export function coalesceTurns(turns: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = []
  for (const turn of turns) {
    const last = merged[merged.length - 1]
    if (last && last.role === turn.role) {
      last.content += '\n\n' + turn.content
    } else {
      merged.push({ ...turn })
    }
  }
  return merged
}
