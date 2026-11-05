# AccountingSim — the pages, in plain words

This is what each screen of the app is and what is on it. It will also be saved in the project as `pages.md`, so it can be handed to Claude Design.

There are two kinds of people: **the doctor** (teacher) and **students**. Every page has a top bar with the app name, who is signed in, and a Log out button.

---

## 1. Sign in (everyone)
- Type your university email and press **Send code**.
- An email arrives with a 6-digit code. Type it and press **Verify**.
- A **Resend code** button and a **Use another email** link.
- If the email is not a GUtech student email or one of the doctor emails, a message says it is not allowed.
- After signing in, the doctor goes to her home page, students go to theirs.

---

## Doctor's pages

### 2. Doctor home
- How many classes and students she has.
- Exercises the AI made that are waiting for her to check.
- Current assignments: deadline and how many students have handed in.
- Three big buttons: **Create exercise**, **Upload lecture slides**, **Create class**.

### 3. My classes
- A list of her classes, each with its name, number of students, and a **class code** she gives to students so they can join.
- Create a new class, rename one, make a new class code, or close a class.

### 4. One class
- The list of students in the class: email, when they joined, how many assignments they did, their average mark.
- Remove a student.
- The assignments given to this class.

### 5. Lecture library
- Upload lecture slides and PDFs (all the course material).
- A list of uploaded files with the lecture name/number and whether the app finished reading it.
- The AI uses these slides as its reference when making exercises, so the exercises look and sound like the course.

### 6. My exercises
- All exercises: title, business name, ready or still a draft, date, how many times assigned.
- Open, copy, or delete a draft.

### 7. Create an exercise with AI
- A big box: **"Describe the exercise you want"** (e.g. "A car-wash in Muscat, 10 transactions, include an owner withdrawal").
- Optional helpers:
  - Business idea (leave empty and the AI invents a realistic Omani business)
  - Topic
  - Difficulty: easy / medium / hard
  - Number of transactions
  - Things that must be included (e.g. "prepaid rent", "personal expense")
  - Which parts she wants: transaction table, journal entries, financial statements, short number questions, or "let the AI decide"
  - Currency (OMR by default)
- **Upload a sample**: "Make one like this" with a slide or PDF of an old exercise.
- **Generate** button, then a short wait with messages like "Reading your slides… Writing the exercise… Checking the answers…".

### 8. Check and edit the exercise (before students see it)
- A box at the top with anything the doctor should notice: numbers that don't add up, or anything the AI added that is not in her slides.
- Four views:
  - **Student view**: exactly what students will see.
  - **Answer key**: the same, with all correct answers filled in.
  - **Edit**: change the story, any transaction, any number, any answer, add or remove parts. Totals update by themselves.
  - **Other versions**: see examples of the same exercise with different numbers (for when each student gets their own numbers).
- **Ask the AI to change it**: a box like "make transaction 6 harder" or "add a balance sheet part". Older versions can be brought back.
- Buttons: **Save**, **Publish**, **Give to a class**.

### 9. Give an exercise to a class
- Choose the class.
- Start date and **deadline**.
- Mode:
  - **Practice**: students can check their answers while they work.
  - **Graded**: students see their marks only after the deadline.
- Numbers: **same for everyone** or **different for each student**.

### 10. Marks for an assignment
- How many students handed in, the class average, the deadline (she can change it or close it early).
- A table: each student, whether they started / handed in / missed the deadline, their mark, and a **View** button.
- Which parts and which transactions most students got wrong.
- **Download as Excel**.

### 11. One student's answers
- The student's exercise with their answers, each marked right or wrong, next to the correct answer.
- Their mark for each part and the total.

---

## Student's pages

### 12. Student home
- **Join a class**: type the class code from the doctor.
- My assignments, in three groups:
  - **To do**: deadline and how much is done.
  - **Handed in**: mark (when the doctor's settings show it).
  - **Closed**.

### 13. Solve the exercise
- Top: business name, time left before the deadline, Practice or Graded, and "saved" (work saves by itself).
- The business story and the list of transactions (with this student's own numbers).
- The parts, one under the other. Depending on the exercise, a part can be:
  - **A table to fill in**, like the Karak slide: columns such as Cash, Supplies, Accounts payable, Share capital; one row per transaction; a totals row at the bottom.
  - **Journal entries**: pick an account from a list, write the debit or credit amount; the page shows whether debits equal credits.
  - **Short questions**: "What is the net income?" with one box for the number.
- **Practice mode**: a **Check** button on each part shows which boxes are right or wrong (it does not reveal the answer). Can check as many times as they like.
- **Graded mode**: no checking; a **Hand in** button with "Are you sure?". After that it can't be changed.
- Nothing can be handed in after the deadline.

### 14. My result
- The mark, the mark for each part, and the student's answers next to the correct ones (shown when the doctor's settings allow).

---

## Messages the app can show
- "You don't have access to this page."
- "This page doesn't exist."
- "The deadline has passed."
- "You've been signed out, please sign in again."

## Company simulation pages

The **Simulations** top-bar tab opens a separate company game flow alongside ordinary exercises.

| Page | Route | What happens |
|---|---|---|
| My simulations | `/t/sims` | Create with AI, add the four-month Karak sample, copy, or open a draft/published simulation. |
| Create a simulation | `/t/sims/new` | Describe the company, decisions, topics, events and different student tasks for each month. The AI writes and validates the model and coursework. |
| Review and edit | `/t/sims/[id]` | See the monthly task plan, test play each month and its answer key, edit shared or month-specific worksheets, revise with AI, restore a version, publish. |
| Give a simulation to a class | `/t/sims/[id]/assign` | Choose the class, final deadline in Muscat time, and the accounting/business weights. Month one opens immediately. |
| Control room | `/t/sim-runs/[id]` | Track progress and the leaderboard with student emails, open the next month, end early, or download Excel. Ask AI to change an unopened month's tasks, preview the student sheet/answer key, then apply to this class. Current and completed months stay locked. |
| One company's results | `/t/sim-runs/[id]/students/[sid]` | Review decisions, events, marked coursework, feedback, charts and true statements month by month. |
| Leaderboard export | `/t/sim-runs/[id]/export` | Download Excel with company, student, rank, weighted mark, business score, accounting marks and auto-played month counts. Teacher access required. |
| Student company | `/s/sims/[runId]` | Name the company, decide, reveal the event, complete this month's teacher-directed tasks, and see marks, statements, feedback and company-name leaderboard. Earlier months remain available during play. When the run ends, this same page shows final marks and rank. |

Student home (`/s`) shows simulation cards for joined classes. The teacher controls when months open. Skipped months use default decisions and zero book marks; unfinished books retain locked decisions and receive zero book marks. A late joiner starts in the open month after earlier months are auto-played. Each next month starts from correct closing books, even if the student's answers were wrong.

---
