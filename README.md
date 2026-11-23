# pixel-claude

A pixel-art theme for the Claude desktop app.

A chibi person dances in the left margin and whips a sleeping Claude awake every time you send a
prompt. Claude hands the work to Codex, DeepSeek and ChatGPT: they wake up groggy, sit at a desk with a
laptop, and when the job is done they slam the desk, throw the laptop and go back to bed. They stay
awake for as long as background tasks are still running. Everybody stands on one strip of grass.

The scene fits itself to the shape of the window and keeps clear of the chat column.

## Install

In a terminal session:

`/plugin install pixel-claude --marketplace giaKhangdoan/pixel-claude`

From a shell:

`claude plugin install pixel-claude --marketplace giaKhangdoan/pixel-claude`

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `giaKhangdoan/pixel-claude`, then Add plugin.

To update later: `/plugin update pixel-claude@pixel-claude-marketplace`.

## Notes

- The theme draws in the Claude desktop and mobile apps only. It draws nothing in a terminal or an editor.
- `sounds/` holds three small synthetic sound effects (desk slam, laptop crash, whip crack). They play only
  where Claude Code itself runs on macOS; the theme's own sound cues work in the desktop app.
- `hooks/make-colors.js` is the colour helper that ships with the Claude Code mod tooling.
