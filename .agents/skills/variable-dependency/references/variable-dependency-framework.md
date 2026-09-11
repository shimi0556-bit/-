# Variable Dependency (Attribute Dependency) Framework

## Origins

Variable Dependency, also known as Attribute Dependency, is one of the five core techniques of Systematic Inventive Thinking (SIT). It was developed based on the observation that many successful innovations involve creating new relationships between variables that were previously independent.

Research by Jacob Goldenberg, Roni Horowitz, and others found that this pattern appears in a disproportionate number of successful new products—far more than chance would predict.

## The Principle

**Products and services have attributes (variables). When you create a new dependency between two previously independent variables, you create a new product behavior. That behavior often has unexpected value.**

This is the SIT approach in its purest form:
1. Start with existing variables (Form)
2. Create a new relationship between them (Manipulation)
3. Discover what value emerges (Function Follows Form)

## Variable Classification

### Internal Variables

Attributes that the maker (company/developer/designer) sets and controls. These are "inside" the product boundary.

**Categories:**

**Physical attributes:**
- Size, weight, color, material, shape, texture
- Number of components, configuration

**Functional parameters:**
- Speed, capacity, power, accuracy, resolution
- Frequency, duration, intensity, range

**Business parameters:**
- Price, discount, payment terms, warranty length
- Availability, quantity limits, delivery options

**Information/content:**
- Language, detail level, formatting, tone
- Recommendations, instructions, alerts

**Process/workflow:**
- Number of steps, sequence, automation level
- Approval requirements, verification depth

**Interface:**
- Complexity, layout, color scheme, typography
- Input method, navigation style, information density

### External Variables

Conditions in the product's environment that the maker does NOT control. These exist "outside" the product boundary but within its Closed World.

**Categories:**

**User demographics:**
- Age, gender, income, education, occupation
- Cultural background, language preference

**User behavior:**
- Usage frequency, session duration, feature usage
- Purchase history, engagement level, loyalty
- Skill level, learning curve position

**User state:**
- Mood, stress level, fatigue, attention
- Goals (browsing vs. buying), urgency
- Social context (alone, with family, in meeting)

**Temporal:**
- Time of day, day of week, month, season
- Time since last use, time since event
- Elapsed time in session, duration of relationship

**Environmental:**
- Weather, temperature, humidity, light level
- Noise level, location (indoor/outdoor, urban/rural)
- Device type, screen size, connectivity quality

**Market/contextual:**
- Competitor actions, market conditions
- Regulatory changes, cultural events
- Economic indicators, demand patterns

## The Dependency Matrix

The matrix is the core tool. It forces systematic exploration of variable pairs.

### Building the Matrix

1. List 10-15 internal variables as rows
2. List 8-12 external variables as columns
3. Each cell represents a potential new dependency
4. Scan systematically—don't just jump to obvious pairs

### Reading the Matrix

For each cell, ask: "What if [row variable] changed as a function of [column variable]?"

**Example:**

```
                  | Time of | User    | Weather | Device  | Usage    |
                  | day     | skill   |         | type    | frequency|
------------------|---------|---------|---------|---------|----------|
Price             |  Surge  | Discount| ?       | ?       | Loyalty  |
                  | pricing | for new |         |         | discount |
------------------|---------|---------|---------|---------|----------|
Content detail    | Brief   | Simple  | ?       | Adapts  | Deeper   |
                  | at night| for new |         | layout  | over time|
------------------|---------|---------|---------|---------|----------|
Notification freq | Quiet   | More    | Weather | ?       | Adapts   |
                  | at night| for new | alerts  |         | to habit |
```

### Finding Gold in the Matrix

**The most innovative ideas often come from:**
- Cells that seem "impossible" or "weird" at first glance
- Pairs where one variable is emotional and the other is functional
- Pairs where one variable is temporal and the other is a core product attribute
- Cells you're tempted to skip because "that doesn't make sense"

## Types of Dependencies to Create

### 1. Linear Dependencies
As Variable A increases, Variable B increases (or decreases) proportionally.

**Example:** As repayment streak (external behavior) increases, interest rate (internal) decreases linearly.

### 2. Threshold Dependencies
Variable B changes abruptly when Variable A crosses a threshold.

**Example:** When battery charge drops below 20% (internal), phone switches to power-saving mode (internal behavior changes). When ambient noise exceeds 70dB (external), headphone volume auto-adjusts (internal).

### 3. Inverse Dependencies
As Variable A increases, Variable B decreases.

**Example:** As user expertise increases (external behavior over time), interface complexity decreases (internal)—the opposite of what you'd expect (experts need LESS interface, not more).

### 4. Categorical Dependencies
Variable B takes different discrete values based on categories of Variable A.

**Example:** Interface language (internal) changes based on content language being viewed (internal). Priority algorithm weights (internal) change based on disaster phase category (external: rescue/relief/rebuild).

### 5. Cyclical Dependencies
Variable B changes in a pattern that cycles with Variable A.

**Example:** Marketing message tone (internal) cycles with day of week (external): motivational Monday, practical Wednesday, celebratory Friday. Payment reminders (internal) cycle with market days (external: specific days when traders have cash).

## Breaking Dependencies

Sometimes the innovation is REMOVING a dependency that everyone takes for granted.

### How to Find Dependencies to Break

1. List things that currently vary together in your product
2. Ask: "Does this HAVE to be this way? Or is it just convention?"
3. For each: "What if these were independent?"

### Classic Breaks

| Before | Dependency | Break | Innovation |
|--------|-----------|-------|------------|
| Cable TV | Watching depends on schedule | Streaming on-demand | Netflix, DVR |
| University | Learning depends on location | Online courses | Coursera, edX |
| Phone | Screen size depends on pocket size | Foldable screen | Samsung Fold |
| Office work | Productivity depends on being in office | Remote tools | Slack, Zoom |
| Music | Listening depends on buying album | Subscription streaming | Spotify |

## Evaluating Virtual Products

After creating a dependency (or breaking one), evaluate the virtual product:

### Value Questions
- Who would benefit from this adaptive behavior?
- Does it solve a real pain or create a genuine gain?
- Would users perceive this as "smart" or "creepy"?
- Is the adaptation fast enough to be useful?
- Is the signal (external variable) reliable enough to base behavior on?

### Feasibility Questions
- Can we detect/measure the external variable?
- Can we change the internal variable dynamically?
- Is the relationship simple enough to implement?
- Are there privacy or ethical concerns with sensing the external variable?

### Innovation Quality Indicators
- **High quality:** The dependency creates behavior that surprises and delights users
- **Medium quality:** The dependency makes the product more efficient or convenient
- **Low quality:** The dependency is obvious or already standard in the industry

## Advanced: Compound Dependencies

Once you're comfortable with single dependencies, try creating compound ones:

**Two external variables influencing one internal:**
- Price varies with BOTH time of day AND demand level
- Content detail varies with BOTH user skill AND session duration

**Chain dependencies:**
- External variable influences Internal A, which influences Internal B
- User behavior triggers notification frequency, which affects content type

These compound dependencies create more sophisticated product behaviors but are harder to implement. Use sparingly, and only when the additional complexity creates proportional value.
