// Tunable safety-net constants for AI feature costs -- the AI Support
// Assistant channel is a flat monthly fee, not metered per-token, so
// nothing else bounds cost per tenant without these. Conservative
// starting defaults, not measured limits -- adjust once ai_usage_log
// shows real per-tenant usage.

// Sent as context on every turn, so an unbounded thread would make
// cost grow with conversation length rather than staying flat per
// message. 20 messages is ~10 back-and-forth exchanges.
export const MAX_HISTORY_MESSAGES = 20

// Per tenant, per calendar month, AI Assistant channel only (counts
// only messages the *user* sent, not AI replies). Once hit, the
// channel gracefully declines further messages until next month
// rather than degrading silently or blowing past the flat fee's cost.
export const MONTHLY_AI_MESSAGE_LIMIT = 300
