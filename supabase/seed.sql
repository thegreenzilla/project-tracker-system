-- First project: Tony Velhagen's ORD Workforce Onboarding (60-day plan, Nov 9 2026 – Jan 8 2027).
-- Run after schema.sql. Set the owner in the app (Project → Settings) once Tony has signed in.

insert into public.projects (id, name, code, goal, description, status, health, start_date, end_date, created_by)
values (
  '0a0d0000-0000-4000-8000-000000000001',
  'ORD Workforce Onboarding', 'ORD',
  'All 90 EVs deployed daily, each with a complete primary team',
  'Tony Velhagen, Head of Operations Readiness (reports to Tiny). One roster in MoberOne, a primary team for every EV, Team Captains owning 8+ teams.',
  'active', 'green', '2026-11-09', '2027-01-08', null
) on conflict (id) do nothing;

insert into public.tasks (project_id, title, workstream, partner, due_date, kind, note, sort, created_by)
select '0a0d0000-0000-4000-8000-000000000001', t.title, t.ws, t.partner, t.due::date, t.kind, t.note, t.sort, null
from (values
  ('Get MoberOne access and load the crew masterfile','MoberOne roster','Jing','2026-11-10','task','',1),
  ('Build next week''s roster in MoberOne','MoberOne roster','Jing','2026-11-12','task','',2),
  ('Publish the W2 roster from MoberOne','MoberOne roster','Jing','2026-11-13','output','',3),
  ('List every active EV (body #, plate, MBR)','Primary team per EV','Daryl','2026-11-09','task','',4),
  ('Assign a GDS, GDA and Assembler to each EV','Primary team per EV','Daryl','2026-11-11','task','',5),
  ('Flag crew gaps and send them to Hiedilyn','Primary team per EV','Hiedilyn','2026-11-13','task','',6),
  ('EV-to-team map and true crew count','Primary team per EV','Daryl','2026-11-13','output','',7),
  ('Brief Rham and Paul on the Project Prime model','Team Captains','Rham, Paul','2026-11-09','task','',8),
  ('Assign 8 teams to each captain','Team Captains','Rham, Paul','2026-11-10','task','',9),
  ('Run T12, call-time and closeout checks daily','Team Captains','Rham, Paul','2026-11-13','task','',10),
  ('16 teams under captains, first team scorecards','Team Captains','Rham, Paul','2026-11-13','output','',11),
  ('First count of drivers, helpers and assemblers on file and qualified','Crew count','HR','2026-11-13','task','',12),
  ('Run MoberOne roster in parallel with the chat roster','MoberOne roster','Jing','2026-11-20','task','',13),
  ('Reconcile the seven workforce numbers','Crew count','','2026-11-20','task','',14),
  ('Design the HR kiosk concern process','HR kiosk','Owen','2026-11-20','task','',15),
  ('Finish MoberOne training for the legacy team','Legacy team','Jing','2026-11-20','task','BeB, Claire, Des, Thuesday, Precious, Meaan, Van',16),
  ('Day 14 review with Tiny','Reviews with Tiny','Tiny','2026-11-20','review','',17),
  ('Chat roster off; lock D-1 roster daily in MoberOne','MoberOne roster','Jing','2026-11-23','task','',18),
  ('Fill crew gaps on EVs without a full team','Primary team per EV','Hiedilyn','2026-11-27','task','',19),
  ('Seven numbers tie out daily','Crew count','','2026-11-27','task','',20),
  ('Set up the HR kiosk at the hub','HR kiosk','Owen','2026-11-27','task','',21),
  ('Size the DrayberFlex standby pool (10–15%)','DrayberFlex standby','Hiedilyn','2026-11-27','task','',22),
  ('Review legacy team roles','Legacy team','Tiny','2026-11-27','task','',23),
  ('Name and train new Team Captains (11–12 total)','Team Captains','Rham, Paul','2026-12-04','task','',24),
  ('HR kiosk live; weekly concern review','HR kiosk','Owen','2026-12-04','task','',25),
  ('Every EV locked to a primary team','Primary team per EV','Daryl','2026-12-04','task','',26),
  ('Hold 10–15% standby daily','DrayberFlex standby','Hiedilyn','2026-12-04','task','',27),
  ('Day 30 review with Tiny','Reviews with Tiny','Tiny','2026-12-08','review','',28),
  ('All teams covered at 1 captain : 8 teams','Team Captains','Rham, Paul','2026-12-11','task','',29),
  ('Day 60 review with Tiny','Reviews with Tiny','Tiny','2027-01-07','review','',30)
) as t(title, ws, partner, due, kind, note, sort)
where not exists (select 1 from public.tasks where project_id = '0a0d0000-0000-4000-8000-000000000001');
