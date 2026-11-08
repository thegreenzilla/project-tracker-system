# Project Tracker System — specification

## Purpose
Mober runs many improvement projects at once (ORD workforce, DrayberFlex, HR kiosk, Project Prime, MoberOne rollout). Today they live in decks, chats and one-off trackers. This system is the single source of truth for every project's owner, plan, progress and weekly review.

## Users
| Who | Needs |
|---|---|
| CEO, COO, CFO | One screen across all projects: which are off track, overdue or missing a review |
| Project owner (e.g. Tony) | A task list by week, a progress view, and a place to write the Monday review |
| Team members | See their tasks, update status and notes |

## Functions
1. **Portfolio**: active projects count, on-schedule % (tasks due so far that are done), overdue, blocked, projects with no review this week. Table of all projects sorted red → amber → green. Filter All / Mine.
2. **Project → Tasks**: tasks grouped by week from the project start, filter by workstream, hide done. Tick to complete, set status, open for notes, due date, assignee and partner. Add tasks.
3. **Project → Overview**: planned vs done chart, progress by workstream and by week, overdue/blocked list, open tasks by person.
4. **Project → Weekly review**: one per week. Health, summary, wins, issues, decisions, next week, with the week's numbers shown alongside. Saving sets the project's health. History of past reviews.
5. **Project → Settings**: details, owner, sponsor, dates, status; team members as editor or viewer; admins can delete.
6. **People**: own name and title; admins set roles.

## Rules
- Everyone at Mober can see every project. Only the people on a project can change it.
- A task is overdue when it is not done and its due date is before today.
- On schedule = done ÷ tasks due up to today.
- A review is "due" when an active project has no review for the current week (Monday start).

## Out of scope for v1
Gantt dependencies, time tracking, budgets, file attachments, notifications (planned next).
