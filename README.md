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

## What lives in the scene (0.4)

- **Whip wake-up**: send a prompt and the hero dances (random tempo), says a teasing line plus a short summary of your prompt, and cracks the whip twice.
- **Task letters**: Claude hands jobs to Codex, DeepSeek and ChatGPT by throwing a letter on their heads; they power up, read it and work. The right AI is picked from the Agent/Task call or command.
- **Live thoughts**: the newest words of what Claude (and each subagent) is thinking appear in small speech bubbles.
- **Done**: the results fly back, desks get slammed, laptops are thrown in a random direction, everybody goes back to bed. The sky glows with dawn, confetti falls, the hero praises the team and a gold star is added at the top-left for every finished request.
- **While idle**: now and then someone talks in their sleep.
- Shooting stars, per-AI typing speed and stretching, desynchronised snoring.

## More life (0.5)

- **Fireworks** burst over the scene when a request finishes.
- **Storm**: when two or more AIs work at once it rains, with lightning flashes.
- **Fireflies** drift over the grass while everything is quiet; a small UFO crosses the sky now and then.
- **Dawn and dusk** tint the sky according to your local clock.
- **Oops**: when a tool call fails, a red "!?" and sweat drops pop up over whoever ran it.

## Who shows up (0.6)

A different chibi turns up for each prompt, picked from what it is about (the classic whip-wielder is also in the mix):

| Prompt about | Who | Weapon | Hits go |
| --- | --- | --- | --- |
| bug, lỗi, fix, crash | mechanic in a hard hat | wrench | keng! boong! |
| explain, docs, viết, dịch | teacher with glasses | ruler | bốp! cạch! |
| refactor, dọn, tối ưu | chef | frying pan | xoảng! |
| deploy, gấp, security, build | ranger in a red cap | ray gun with a laser beam | pằng! píu! |
| UI, design, css, màu | artist in a beret | paintbrush | xẹt! bẹt! |

Each has their own outfit and lines on top of the usual teasing ones.
