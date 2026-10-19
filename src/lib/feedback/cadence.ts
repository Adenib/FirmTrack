// The feedback popup's backoff schedule: 14 days until the first prompt
// (the app_feedback_prompts row's own default next_prompt_at), then this
// function decides the gap until the NEXT prompt each time one is shown --
// 30 days after the 1st, 45 days after the 2nd and every one after that.
// Purely time-based: it doesn't matter whether the user submitted a
// rating, hit "Remind me later", or just ignored it.
export function nextPromptDelayDays(promptCountBeforeThisPrompt: number): number {
  if (promptCountBeforeThisPrompt <= 0) return 30
  if (promptCountBeforeThisPrompt === 1) return 45
  return 45
}
