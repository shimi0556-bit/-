---
name: variable-dependency
description: Generate innovative ideas by creating new dependencies between previously independent variables. Part of SIT (Systematic Inventive Thinking) ideation toolkit. Map internal variables (controlled) and external variables (uncontrolled), then link pairs that were never connected before to discover non-obvious innovations. Can be used standalone or as part of ideation-sit orchestration.
---

# SIT: Variable Dependency - Create New Relationships Between Variables

## Purpose

Generate innovative ideas by discovering what happens when you create new dependencies between variables that are currently independent. This technique produces "smart" products and services that adapt, respond, and behave differently based on changing conditions—innovations that customers could never have articulated wanting.

## When to Use This Skill

Use this skill when:
- You want to make a product/service that adapts to context, users, or conditions
- You're looking for "intelligent" product behaviors
- Current product treats all users/situations the same (one-size-fits-all)
- You want innovations that feel magical ("how did it know to do that?")
- You need ideas beyond what SCAMPER modification provides
- Part of a comprehensive SIT session (use ideation-sit orchestrator)

## The Variable Dependency Technique

**Core question:** What if [Variable A] changed as a function of [Variable B]?

**Philosophy:** Most products have variables that are fixed or independent of each other. By creating new dependencies between them, you create products that respond to their environment in ways no one has seen before. The innovation isn't adding something new—it's creating a new relationship between things that already exist.

## Understanding Variables

### Internal Variables (Controlled by the Maker)

These are attributes of the product/service that you set and control:

- **Product attributes:** Size, color, shape, weight, material, texture
- **Functional parameters:** Speed, capacity, frequency, intensity, accuracy
- **Business parameters:** Price, availability, quantity, terms, duration
- **Interface elements:** Language, complexity, layout, information density
- **Content:** Messages, recommendations, instructions, alerts
- **Process:** Sequence of steps, timing, automation level

### External Variables (In the Environment)

These are conditions the maker does NOT control but that exist in the product's world:

- **User characteristics:** Age, skill level, mood, income, location, language, preferences
- **User behavior:** Usage frequency, time spent, actions taken, history, patterns
- **Time:** Time of day, day of week, season, elapsed time, time since event
- **Environment:** Weather, temperature, ambient noise, light level
- **Context:** Social setting, urgency, device type, connectivity level
- **Market conditions:** Demand level, competitor actions, regulatory changes

## Three Types of Variable Dependencies

### Type 1: Internal ↔ Internal
Two product attributes that now co-vary. When one changes, the other changes.

**Examples:**
- Font size varies with paragraph importance (more important = larger)
- Battery usage mode varies with charge level (low charge = power-saving automatically)
- Content detail level varies with article length (longer articles get summaries)

### Type 2: Internal ↔ External
A product attribute that responds to an environmental or user condition. This is the most common and often most powerful type.

**Examples:**
- Price varies with demand (surge pricing—Uber)
- Lens tint varies with sunlight (Transition lenses)
- Display brightness varies with ambient light (smartphone auto-brightness)
- Notification frequency varies with user stress level (detected via usage patterns)
- Interface complexity varies with user expertise (progressive disclosure)

### Type 3: Breaking Existing Dependencies
Two variables that are currently linked become independent. Sometimes innovation means REMOVING a dependency, not adding one.

**Examples:**
- Phone screen size no longer depends on phone body size (foldable phones)
- Movie watching no longer depends on broadcast time (streaming on-demand)
- Music ownership no longer depends on buying physical media (Spotify)
- Learning no longer depends on being in a classroom (online courses)

## Workflow

### Step 1: Map Your Variables

**List internal variables (aim for 10-15):**
Go through your Closed World internal components and extract the controllable attributes of each.

Example for a lending app:
- Interest rate, loan amount, repayment period, notification frequency, approval speed, interface language, credit assessment method, loan terms display, repayment schedule flexibility, support channel

**List external variables (aim for 8-12):**
Go through external components and environmental factors.

Example for a lending app:
- User's income pattern, time of day, user's repayment history, local market conditions, user's phone type, connectivity level, user's location, weather (affects market traders), user's age, user's business type

### Step 2: Build the Dependency Matrix

Create a matrix with internal variables as rows and external variables as columns. Each cell represents a potential new dependency.

```
                    | Time of  | User's    | Repayment | Phone  | ...
                    | day      | income    | history   | type   |
--------------------|----------|-----------|-----------|--------|----
Interest rate       |  [?]     |   [?]     |   [?]     |  [?]   |
Loan amount         |  [?]     |   [?]     |   [?]     |  [?]   |
Notification freq   |  [?]     |   [?]     |   [?]     |  [?]   |
Interface language  |  [?]     |   [?]     |   [?]     |  [?]   |
...                 |          |           |           |        |
```

You don't need to fill every cell. Scan for interesting pairs.

### Step 3: Create Virtual Products

For each promising pair, create a "virtual product" by stating the dependency:

**Formula:** "[Internal variable] changes as a function of [External variable]"

Then apply Function Follows Form:
1. What would this product look like?
2. How would it behave?
3. Who would benefit?
4. What problem does it solve?

### Step 4: Also Consider Internal ↔ Internal Dependencies

Some of the most interesting innovations come from linking two internal variables:
- Does loan amount affect interest rate? (Maybe it should, but inversely to what's expected)
- Does notification content change based on notification frequency?
- Does the approval process change based on loan size?

### Step 5: Consider Breaking Existing Dependencies

Look at current dependencies and ask: "What if these were independent?"
- What if price didn't depend on cost?
- What if availability didn't depend on inventory?
- What if access didn't depend on location?

### Step 6: Generate 8-12 Ideas

Push beyond obvious dependencies. The most innovative ideas come from unlikely variable pairs.

### Step 7: Capture and Document

Record each idea with:
- The dependency created (or broken)
- The variables involved and their types
- The value discovered

## Prompting Questions

Use these to stimulate thinking for each variable pair:

**Creating dependencies:**
- What if [product attribute] automatically adjusted based on [user condition]?
- What if [feature intensity] responded to [environmental factor]?
- What if [business term] varied with [user behavior]?
- What if [content] adapted to [context]?
- What if [process step] changed based on [time factor]?

**Breaking dependencies:**
- What if [currently linked attribute] was completely independent of [its current driver]?
- What if users could control [something currently automatic]?
- What if [something that varies] became fixed?
- What if [something restricted by X] was freed from that constraint?

**Unusual pairs:**
- What's the most unlikely pair on my matrix? What would happen if I linked them?
- What if a customer-facing attribute depended on an operational variable?
- What if an operational parameter adapted to an emotional state?

## Examples from Case Studies

### FairCredit (Nigeria Micro-Lending)

**Dependency #1:** Interest rate ↔ repayment streak
- **Type:** Internal-Internal
- **Virtual Product:** Interest rate automatically decreases after consecutive on-time repayments. Resets after a late payment.
- **Value:** Self-rewarding system. Borrowers are motivated to maintain streaks. Loyal borrowers get better rates without negotiating. Risk-adjusted pricing happens automatically.

**Dependency #2:** Loan amount available ↔ time of day
- **Type:** Internal-External
- **Virtual Product:** Maximum available loan is higher during early morning hours (5-7 AM) when market traders buy stock, lower during evening.
- **Value:** Matches real cash-flow needs. Traders get capital when they need it most. Reduces frivolous borrowing during off-hours.

**Dependency #3:** SMS notification language ↔ user's phone language setting
- **Type:** Internal-External
- **Virtual Product:** System auto-detects phone language and sends loan terms, reminders, and tips in Yoruba, Igbo, Hausa, or English accordingly.
- **Value:** Non-English speakers understand their obligations. Reduces disputes. Builds trust with wider population.

**Dependency #4:** Repayment flexibility ↔ market day schedule
- **Type:** Internal-External
- **Virtual Product:** Repayment due dates automatically align with local market days (when traders have cash) rather than fixed calendar dates.
- **Value:** Payments fall on high-cash-flow days. Default rates drop. System feels designed for their reality.

**Dependency #5:** Credit assessment depth ↔ loan amount requested
- **Type:** Internal-Internal
- **Virtual Product:** Small loans (under 5,000 NGN) approved with minimal checks. Larger loans trigger progressively more verification steps.
- **Value:** Tiny loans are near-instant, building trust. Larger loans are appropriately vetted. Risk is proportional.

### AsyncFlow (Southeast Asia Remote Collaboration)

**Dependency #1:** Notification urgency level ↔ recipient's current focus mode
- **Type:** Internal-External
- **Virtual Product:** If a user is in "deep work" mode, only critical notifications break through. Others queue for their next break.
- **Value:** Respects focus time across time zones. Non-urgent messages don't destroy flow states. Users trust the system to filter appropriately.

**Dependency #2:** Meeting recording detail level ↔ participant absence
- **Type:** Internal-External
- **Virtual Product:** When team members are absent from a meeting, the recording automatically generates a more detailed summary with action items highlighted for those who missed it.
- **Value:** Absent team members (common with 6+ hour time zone spreads) get richer catch-up content. Present members get brief notes. Same meeting, different outputs.

**Dependency #3:** Interface language ↔ content being discussed
- **Type:** Internal-Internal
- **Virtual Product:** When discussing a document in Thai, the interface tools and prompts appear in Thai. When switching to an English document, interface follows.
- **Value:** Multilingual teams work in their most comfortable language per task. No global language setting needed.

### SolarSeva (Rural India Home Solar)

**Dependency #1:** Payment amount ↔ energy generated that month
- **Type:** Internal-External
- **Virtual Product:** Monthly payment varies with actual solar energy generated. Monsoon months (less sun) = lower payment. Summer months (more sun) = slightly higher payment.
- **Value:** Feels fair—pay less when you get less. Reduces complaints during monsoon. Aligns cost with value received.

**Dependency #2:** Maintenance alert priority ↔ season
- **Type:** Internal-External
- **Virtual Product:** Pre-monsoon: system sends urgent "clean panels and check seals" alerts. Summer: relaxed maintenance schedule. Dust season: weekly cleaning reminders.
- **Value:** Maintenance guidance that matches actual conditions. Prevents seasonal damage. Feels locally relevant.

**Dependency #3:** Battery charge reserved for emergency ↔ local grid reliability
- **Type:** Internal-External
- **Virtual Product:** In areas with frequent grid outages, battery automatically reserves 20% charge as emergency backup. In reliable-grid areas, it uses full capacity.
- **Value:** Adaptive resilience. Households in unreliable-grid villages always have emergency light. System learns local conditions.

### Unbroken (Sweden Disaster Logistics)

**Dependency #1:** Data sync frequency ↔ connectivity quality
- **Type:** Internal-External
- **Virtual Product:** Full real-time sync on good connections. Compressed periodic batch sync on poor connections. Store-and-forward mode when offline.
- **Value:** System never fails—just degrades gracefully. Volunteers don't lose data when connectivity drops. Automatically recovers when connection improves.

**Dependency #2:** Resource allocation priority weights ↔ time since disaster
- **Type:** Internal-External
- **Virtual Product:** Algorithm automatically shifts priorities: Hour 0-24: water, rescue, medical. Day 2-7: shelter, food, sanitation. Week 2+: rebuilding, psychological support.
- **Value:** No manual reprioritization needed. System evolves with disaster phase. Coordinators can override but defaults are smart.

## Output Format

```markdown
# VARIABLE DEPENDENCY Ideas: [Product/Service Name]

## Variable Inventory

**Internal Variables (controlled):**
1. [Variable] - [brief description of range/options]
2. [Variable] - [brief description]
[List 10-15]

**External Variables (environment/user):**
1. [Variable] - [brief description of range/conditions]
2. [Variable] - [brief description]
[List 8-12]

## Dependency Matrix Highlights

[Note the most interesting variable pairs from scanning the matrix]

## New Dependency Ideas

### Idea 1: [Short Name]
**Dependency:** [Internal variable] varies with [External/Internal variable]
**Type:** [Internal-Internal / Internal-External / Breaking existing]
**Virtual Product:** [Describe what the product does with this dependency]
**Value Discovered:**
- [Benefit 1]
- [Benefit 2]
**Who benefits most:** [Target user/segment]
**Feasibility:** [High/Medium/Low]

### Idea 2: [Short Name]
[Same structure]

[Continue for 8-12 ideas]

## Broken Dependency Ideas

### Idea B1: [Short Name]
**Current dependency:** [Variable A] currently depends on [Variable B]
**What if independent:** [Describe the product without this link]
**Value Discovered:** [What new capability or freedom this creates]

[Continue for 2-3 ideas]

## Summary
**Total dependency ideas:** [count]
**Most promising:** [List top 3-4]
**Most surprising:** [Which ideas emerged that no one would have requested?]
**Ready for:** Evaluation phase or continue with other SIT techniques
```

## Tips for Success

**Do:**
- Spend time mapping variables thoroughly—the richness of your variable list determines idea quality
- Try unlikely pairs—the most innovative dependencies come from variables no one thought to connect
- Consider the user's emotional and contextual variables, not just physical ones
- Think about breaking dependencies too, not just creating them
- Include "time" as a variable—many powerful innovations involve time-based adaptation

**Don't:**
- Stop at obvious dependencies (price ↔ demand is known; go further)
- Dismiss a dependency because "it would be hard to implement"—you're discovering value, not building yet
- Forget external variables—the most powerful dependencies often link internal attributes to external conditions
- Only consider linear relationships—sometimes the dependency is a threshold, a curve, or an inversion

## Common Pitfalls

- **Only mapping obvious variables:** Dig deeper. "User's mood" and "social context" are valid external variables, not just "time of day."
- **Creating trivial dependencies:** "Price varies with quantity" already exists. Look for genuinely new relationships.
- **Forgetting Function Follows Form:** After creating the dependency, you MUST ask "what value does this create?" The dependency alone isn't the innovation—the discovered value is.
- **Skipping the matrix:** The matrix forces you to consider pairs you'd never think of intuitively. Don't skip it.
- **Only creating, never breaking:** Some of the best innovations break existing dependencies (streaming broke the schedule-dependency of TV watching).

## Integration Points

**Input from solution-definition:**
- Closed World internal components map to internal variables
- Closed World external components map to external variables
- PRFAQ customer pains suggest which dependencies would be most valuable

**Output to idea-evaluation:**
- Variable dependency ideas with clear value propositions
- Feasibility notes (some dependencies are easy to implement, others need sensors/data)
- Target user segments for each dependency

**Used with other SIT techniques:**
- Variable Dependency + Subtraction: Remove a component, then create a dependency to compensate
- Variable Dependency + Task Unification: A component with a new task whose behavior depends on context
- Variable Dependency + Multiplication: Copies that differ based on a variable dependency

## Next Steps

After generating variable dependency ideas:
1. **Continue SIT:** Use ideation-sit orchestrator for Subtraction, Multiplication, Division, Task Unification
2. **Or continue SCAMPER:** Add to your SCAMPER ideas for a larger portfolio
3. **Evaluate:** Use idea-evaluation skill to rate dependency ideas
4. **Validate:** Test assumptions with critical-validation skill

Variable Dependency is often the most distinctive SIT technique—it produces "smart" products that feel like magic to users.
