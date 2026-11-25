# To do

Agreed with Jeremy, not built yet. Newest first.

## Program setup (Varsity / JV / Freshman)

Decided 2026-11-25. Keep it as easy as possible for coaches: nobody uses it if it's hard.

- **Program is the parent; Varsity, JV and Freshman are teams under it.** A single team (youth, or a school with one team) never sees levels; they appear only when a second team is added.
- **One program roster.** Each player's roster row has a checkbox per team (V / JV / F) instead of a dropdown; tick every team a kid is on. A kid's Study page shows the installs of every team they're on, labeled. Unticking keeps their history.
- **One program playbook, not copies.** Each team ticks the plays it runs. "Make a JV version" makes a linked copy only when a level really needs a different play.
- **Numbers shared across the program** (a call is the same number for a kid on JV and Varsity). Each team keeps its own install, game plans, band setups, calling and signals.
- **Coach roles.** Program head coach can do everything; level coaches run their own team; a coach can be on more than one team.

## Program schedule

- Every team's games in one schedule: date, opponent, level, home/away. Game plans hang off a game.
- The quarters tracker needs it (games per season set Colorado's season cap; days between games set the 3-day limit).

## Quarters tracker (playing-time limits)

May be a feature coaches don't use, so keep it out of the way until turned on.

- **The state comes from the school's address** (no state picker). Reps fills in that state's rule with a link to the source and the date checked; the coach taps "Looks right" or changes it. Recheck at the start of each season and ask again only if the rule changed. The log keeps which rule the coach agreed to.
- **After each game:** Q1–Q4 boxes on each player row, plus "Played all 4". Totals add up across every team a kid played for.
- **Warnings:** yellow one quarter from a limit, red at it. A "Who can still play" list before each game. Warn only; never block the coach.
- **Audit log by week:** every team tick and every quarter entered or corrected, with who and when. Prints as a weekly report for the athletic director or the state association.
- **Youth leagues:** the opposite rule, a minimum number of plays per kid. Same tracker, counting plays, warning when a kid is short.

### State rules

Only Colorado is researched, for testing. Research the other states and the youth leagues after launch.

**Colorado (CHSAA), from the 2026 Football Bulletin (dated July 2026), "Maximum Quarters Individual", CHSAA Bylaw 3440:**

- Season: 42 quarters with 8 games, 48 with 9, 52 with 10.
- No more than 6 quarters in 3 days, and no more than 7 quarters in a week.
- A week is Thursday to Wednesday.
- Kicking plays and state playoff games don't count.
- The 6-quarters-in-3-days rule can be waived for postponed contests.
- Not stated in the bulletin: what counts as playing a quarter (for example, whether one snap counts). Make it a setting and ask the coach.
- Source: the bulletin linked from https://chsaanow.com/sports/football/bulletin (Google Doc 1Y9zR6qQh4UK27eMzqWLEf9he2KRnlSdzJplKFQLA7dY).

To check after launch: every other state association's football limits, and the youth leagues' minimum-play rules.
