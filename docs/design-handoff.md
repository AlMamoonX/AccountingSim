# AccountingSim — Design handoff (Karak Pop)

Nov 5, 2026 · Skinnybich

## The look in one line
Karak Pop is bold, playful and friendly: a saffron-yellow background, deep indigo ink, chunky rounded white cards, big tight headings and small tilted "stickers". Motion is springy but quick. It should feel like a fun study app, not a bank.

Every page is a clickable mock-up on the design canvas, on its page Karak Pop app; press Play on any frame. All data on the pages (classes, emails, marks, business names, numbers) is sample data and must come from the database in the real app.

## Design tokens
Use these values exactly; they are what the mock-ups use.

### Colours
| Token | Hex | Use |
|---|---|---|
| --bg | #FFD43B | Page background (saffron) |
| --ink | #1A0F3C | Main text, dark cards, top bar, primary buttons |
| --surface | #FFFFFF | Cards |
| --purple | #5B2BD9 | Focus ring, progress bars, button drop-shadow |
| --pink | #FF4D8D | Big special actions (Hand in, Create exercise, Give to a class) |
| --teal | #00B3A4 | Success, Saved, Ready, Upload |
| --blue | #2E5BFF | Correct mark, Practice badge |
| --orange | #E8590C | Wrong mark (icons only, never body text) |
| --muted | #5B5275 | Secondary text on white |
| --muted-on-ink | #D9D2F2 | Secondary text on indigo |
| --field | #F7F4FF | Input background |
| --field-border | #E7E1F5 | Input border |
| --track | #F0EBFF | Empty progress track, row dividers |

### Tints and the text that goes on them
Tint backgrounds: yellow #FFF6CC, pink #FFE3EE, teal #DDF6F3, purple #ECE6FF, blue #E8EEFF, orange #FFEADB.

| Meaning | Text | Background |
|---|---|---|
| Ready / right | #00665E | teal tint |
| Draft / graded | #A3124A | pink tint |
| Practice / right | #1B3FCC | blue tint |
| Error | #8A2E00 | orange tint |
| Delete / close links | #A33A05 | white |

These pairs pass 4.5:1 contrast. Right and wrong are told apart by blue vs orange plus an icon (✓ / ×), never by colour alone.

### Type
| Role | Font | Size / line-height | Weight / spacing |
|---|---|---|---|
| Page title (h1) | Bricolage Grotesque | 76–92px / 0.88 (48px on phones) | 800 / −0.05em |
| Section title (h2) | Bricolage Grotesque | 24–32px | 800 / −0.03em |
| Card title | Bricolage Grotesque | 19–26px | 800 |
| Body | Bricolage Grotesque | 15–18px | 500 |
| Labels | Bricolage Grotesque | 13–15px | 700 |
| Numbers, codes, emails | DM Mono, tabular-nums | as context | 400–500 |

### Shape and spacing
- Radius: big cards 28–36px; small cards and rows 18–24px; inputs 14–16px; buttons and badges 999px (pill).
- Signature shadow is a solid offset, not a blur: `0 8px 0 #1A0F3C` on hero cards, `0 5px 0 #5B2BD9` on primary buttons.
- Part badges (A, B, C) are 56–64px rounded squares tilted −6° to +5°; stickers are pill labels tilted about 7°.
- Page max-width 1160px, side padding 24px, section gap 24–32px, card padding 26–32px.

## Components
Every control is a real button, link or input with a label; icon-only buttons get an aria-label; touch targets are at least 44px.

| Component | Spec |
|---|---|
| Top bar | Indigo pill (radius 28px). Logo "AccountingSim" in yellow. Doctor nav pills: Home, Classes, Lectures, Exercises; current page = yellow pill with ink text and aria-current="page". Right side: email in DM Mono + white Log out pill. Wraps on phones. |
| Primary button | Ink background, yellow text, 52–60px tall, pill, purple offset shadow. |
| Special button | Pink background, 3px ink border, ink text, ink offset shadow. One per page at most (Hand in, Create exercise, Give to a class). |
| Secondary button | White, 2px ink border, ink text. |
| Text button | No background, underlined; Delete and Close class in #A33A05. |
| Input | 48–52px tall, field background, 2px field border; on focus a purple border and white background. Number inputs in DM Mono, right-aligned. |
| Answer box | 48px input, radius 14. Checked right = blue tint, blue border, small blue ✓ badge at the top-right. Checked wrong = orange tint, orange border, orange × badge, and a wobble. |
| Status badge | Pill with a tint background and its matching dark text. |
| Progress bar | 10–14px tall on the track colour; purple, teal or pink fill; rounded. |
| Choice card | Big button with role="radio". Selected = ink border, tint background, offset shadow and a ✓ that pops in at the top-right. |
| Tabs | Pill group on the track colour; active tab = ink pill with yellow text. |
| Drop zone | 4px dashed ink border, radius 36, half-transparent white; on hover it turns white and the icon bobs up. |
| Confirm popover | White card, 3px ink border, radius 24, offset shadow; grows from the bottom-right, from the button that opened it. |

## Motion rules (Emil Kowalski style)
Animate only transform and opacity (plus a small blur on fades), keep it fast, and never animate typing or anything done many times a minute.

| Curve | Value | Use |
|---|---|---|
| --spring | cubic-bezier(0.34, 1.4, 0.64, 1) | Entrances and pops (slight overshoot) |
| --spring-strong | cubic-bezier(0.34, 1.56, 0.64, 1) | Button press, stickers, check marks |
| --ease-out | cubic-bezier(0.23, 1, 0.32, 1) | Anything that should not bounce |

| Moment | Animation |
|---|---|
| Page load | Sections rise in from translateY(24px) scale(.98), 620ms, staggered 60–80ms |
| Button press | scale(0.95) while pressed, 180ms |
| Hover (fine pointers only) | Buttons lift 2px; cards lift 4px and tilt −0.4° |
| Check answers | Marks pop in from scale(.3) rotate(−45deg), 420ms, 60ms apart |
| Wrong box | One wobble (rotate −3°, +2.5°, −1°), 420ms |
| Saving / Saved | Crossfade with slight scale; Saved about 800ms after the last keystroke |
| Popovers and toasts | From scale(.9) + fade, 320ms, origin at the button; never from scale(0) |
| Progress bars | Fill from scaleX(0), 1000ms, after 400ms |
| Result score | Counts up from 0 over 900ms, ease-out quart |
| Sticker | Spins in from rotate(−24deg) scale(.6), 700ms, after 350ms |
| AI working | Rotating rounded square + message crossfade |
| Cup steam | 2.4s gentle loop; the only always-on animation besides loading |

Hover effects sit behind `@media (hover:hover) and (pointer:fine)`. With `prefers-reduced-motion: reduce`, set animations and transitions to about 1ms and stop all loops.

## Pages
There are 15 pages; the file column is the frame's name on the design canvas.

| # | Page | Canvas file | Who | What is on it |
|---|---|---|---|---|
| 1 | Sign in | P01-SignIn | All | Email, then 6-digit code; "not allowed" error with shake; Resend code; Use another email |
| 2 | Doctor home | P02-DoctorHome | Doctor | Class and student counts; 3 big action cards; AI drafts waiting for a check; current assignments with handed-in bars |
| 3 | My classes | P03-Classes | Doctor | Class cards with code + Copy ("Copied!"); Rename, New code, Close class; Create class; closed classes |
| 4 | One class | P04-Class | Doctor | Assignment cards; students table (email, joined, done, average, remove) |
| 5 | Lecture library | P05-Lectures | Doctor | Drop zone; files with status Ready / Reading… / Couldn't read + Try again |
| 6 | My exercises | P06-Exercises | Doctor | Filter All / Ready / Drafts; cards with Open, Copy, Delete (drafts only) |
| 7 | Create an exercise with AI | P07-CreateExercise | Doctor | Prompt box; helpers (business, topic, difficulty, transactions, currency, must-include, parts); sample upload; Generate → 3-step loading → draft ready |
| 8 | Check and edit | P08-ReviewExercise | Doctor | Warnings box; tabs Student view / Answer key / Edit / Other versions; ask the AI to change it; older versions; Save, Publish, Give to a class |
| 9 | Give to a class | P09-GiveToClass | Doctor | Choice cards for class, mode, numbers; start and deadline; live summary; confirm |
| 10 | Marks for an assignment | P10-Marks | Doctor | Handed in, average, deadline (Change / Close now); part and most-missed bars; students table with View; Download Excel |
| 11 | One student's answers | P11-StudentAnswers | Doctor | Total and part marks; grid with wrong values struck and the correct one below; previous / next student |
| 12 | Student home | P12-StudentHome | Student | Join with class code; To do / Handed in / Closed; hidden marks show "Mark after [date]" |
| 13 | Solve the exercise | D-Muscat | Student | Story, transactions, Part A grid, Part B journal, Part C number; Check per part; autosave; Hand in with confirm |
| 14 | My result | P14-Result | Student | Score count-up; part bars; answers next to correct ones (when allowed) |
| — | Messages | P15-Messages | All | No access; page doesn't exist; deadline passed; signed out |

## Behaviour notes
- Practice mode: Check marks each box right or wrong and never shows the answer; typing in a box clears that part's marks.
- Graded mode: no Check buttons; marks stay hidden until the deadline, and Student home shows "Mark after [date]".
- After the deadline: Hand in is disabled and the "deadline has passed" message shows.
- Autosave: "Saving…" while a save is in flight, then "Saved"; debounce about 800ms.
- Answer keys never reach the browser before release; marking happens on the server.
- Equal marks per box or entry: the sample Karak exercise is 18 (Part A with totals) + 4 (Part B) + 1 (Part C) = 23.
- Grid: transaction column about 1.5fr, each account column at least 92px; on phones the grid scrolls sideways in its own box, never the page.
- Responsive: pages are fluid up to 1160px; cards stack to one column on phones and the top-bar nav wraps.

## Sample exercise in the mock-ups (Karak)
The numbers balance to Assets 21,600 = Liabilities 1,800 + Equity 19,800, with net income 1,200; they are invented to fit the build plan's Karak test, so replace them with the doctor's real slide.

| # | Transaction | Cash | Supplies | Equipment | Accounts payable | Share capital | Retained earnings |
|---|---|---|---|---|---|---|---|
| 1 | Shares issued for cash | 20,000 | | | | 20,000 | |
| 2 | Stove and counter bought for cash | −6,000 | | 6,000 | | | |
| 3 | Supplies bought on credit | | 1,800 | | 1,800 | | |
| 4 | Rent paid | −1,200 | | | | | −1,200 |
| 5 | Karak sold for cash | 2,400 | | | | | 2,400 |
| 6 | Dividends paid | −1,400 | | | | | −1,400 |
| | Totals | 13,800 | 1,800 | 6,000 | 1,800 | 20,000 | −200 |

## CSS starter
Copy this into the global stylesheet.

```css
:root{
  --bg:#FFD43B; --ink:#1A0F3C; --surface:#FFFFFF; --purple:#5B2BD9;
  --pink:#FF4D8D; --teal:#00B3A4; --blue:#2E5BFF; --orange:#E8590C;
  --muted:#5B5275; --muted-on-ink:#D9D2F2; --field:#F7F4FF; --field-border:#E7E1F5; --track:#F0EBFF;
  --t-yellow:#FFF6CC; --t-pink:#FFE3EE; --t-teal:#DDF6F3; --t-purple:#ECE6FF; --t-blue:#E8EEFF; --t-orange:#FFEADB;
  --spring:cubic-bezier(0.34,1.4,0.64,1); --spring-strong:cubic-bezier(0.34,1.56,0.64,1); --ease-out:cubic-bezier(0.23,1,0.32,1);
  --font:'Bricolage Grotesque',system-ui,sans-serif; --mono:'DM Mono',ui-monospace,monospace;
}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);-webkit-font-smoothing:antialiased}
.rise{animation:rise 620ms var(--spring) both}
@keyframes rise{from{opacity:0;transform:translateY(24px) scale(.98)}}
.btn{transition:transform 180ms var(--spring-strong)}
.btn:active{transform:scale(.95)}
@media (hover:hover) and (pointer:fine){.btn:hover{transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){*{animation-duration:1ms!important;animation-delay:0ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}
```

Google Fonts link:
https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Mono:wght@400;500&display=swap

## Still open
- [ ] Read the real course slides to confirm the exercise part types (grid, journal, number may not cover every style)
- [ ] Swap sample classes, codes, deadlines and marks for database data
- [ ] Design the Excel export layout (a download, not a page)
- [ ] Design the browser tab icon
