---
description: "Discover uncontested market space using Blue Ocean Strategy tools. Map competitive factors with a Strategy Canvas, identify non-customers and understand why they don't buy, and apply the Four Actions Framework (Eliminate, Reduce, Raise, Create) to find value innovation opportunities. Use during customer discovery to see beyond existing competition. First phase of systematic innovation."
---
# Blue Ocean Discovery: Finding Uncontested Market Space

## Purpose

Discover opportunities beyond existing competition by understanding what the industry takes for granted, who isn't being served, and where value innovation is possible. Instead of fighting for share in crowded "red oceans," Blue Ocean Discovery helps you find open water—market spaces where competition is irrelevant because you've redefined what value means.

## When to Use This Skill

Use this skill when:
- You're entering a market with established competitors and need differentiation
- You suspect there are large groups of people NOT served by existing solutions
- Current industry offerings all look similar (converging on the same features)
- You want to challenge industry assumptions about what customers value
- You're preparing for solution-definition and need strategic clarity
- You want to complement Jobs-to-be-Done analysis with competitive strategy insights

## Execution Modes

Before starting Blue Ocean Discovery, choose your preferred working mode:

### Interactive Mode (Recommended for First-Timers)

Claude will guide you step-by-step through each phase, asking for your input and approval before proceeding.

**Checkpoints:**
1. After Strategy Canvas → Review and approve before non-customer analysis
2. After Non-Customer Analysis → Review and approve before Four Actions Framework
3. After Four Actions Framework → Review final synthesis

**Use when:**
- First time using this skill
- Want hands-on involvement in each step
- Need to discuss assumptions with your team at each stage

### Autonomous Mode (For Experienced Users)

Claude will generate all three outputs based on your initial prompt, then present complete Blue Ocean Discovery for your review.

**Use when:**
- Familiar with Blue Ocean Strategy concepts
- Want fast first draft to iterate on
- Prefer batch review over step-by-step

**To activate a mode, simply state it in your prompt:**
```
Use blue-ocean-discovery skill in interactive mode for [industry/product space].
```
or
```
Use blue-ocean-discovery skill in autonomous mode for [industry/product space].
```

---

## Three-Step Process

### Step 1: Strategy Canvas

Map the competitive landscape by identifying what factors the industry competes on and how players differ.

**How to build a Strategy Canvas:**

1. **Identify competitive factors:** What does the industry believe customers value? List 8-12 factors that companies in this space invest in and compete on.
   - Examples: price, quality, variety, speed, convenience, brand prestige, customer service, features, customization, reliability

2. **Map current players:** For 3-5 key competitors (or competitor types), rate each factor on a scale of 1-5 (Low to High investment/delivery).

3. **Draw the curves:** Each competitor's ratings form a "value curve." When competitors' curves look similar, the industry has converged—a sign of a red ocean.

4. **Find the pattern:** Where do ALL competitors invest heavily? Where do NONE invest? These patterns reveal assumptions ripe for challenging.

**Output:** A Strategy Canvas showing competitive factors, competitor value curves, and initial observations about convergence and gaps.

**For detailed methodology:** Read `references/strategy-canvas-guide.md`

### Step 2: Non-Customer Analysis

Understand who ISN'T buying and why. Non-customers often vastly outnumber existing customers and represent the largest growth opportunity.

**Three tiers of non-customers:**

**Tier 1: Soon-to-be non-customers**
People who minimally use current offerings but are mentally ready to leave. They use the product out of necessity, not choice.
- **Key question:** What would make them leave? What are they tolerating?
- **Example:** Hotel guests who endure budget hotels but would prefer alternatives

**Tier 2: Refusing non-customers**
People who have consciously decided NOT to use the industry's offerings. They've evaluated and rejected what's available.
- **Key question:** Why did they reject existing options? What's the dealbreaker?
- **Example:** People who use public transit because ALL car options feel too expensive/complex

**Tier 3: Unexplored non-customers**
People in distant markets or contexts who have never considered the industry's offerings as an option. The industry has never targeted them.
- **Key question:** What assumptions make the industry blind to this group? What would make the offering relevant to them?
- **Example:** Teenagers who can't drive but would benefit from personal transportation

**For each tier, investigate:**
- Who are they? (Demographics, psychographics, context)
- What do they use instead? (Substitutes, workarounds, or nothing)
- What prevents them from buying? (Price, access, complexity, relevance, awareness)
- What would it take to convert them? (What value proposition would make them switch)
- How large is this tier? (Rough estimate of opportunity size)

**Output:** A non-customer map identifying the three tiers, their barriers, substitutes, and conversion opportunities.

**For detailed methodology:** Read `references/non-customer-analysis.md`

### Step 3: Four Actions Framework (ERRC)

Use insights from the Strategy Canvas and Non-Customer Analysis to define your value innovation strategy.

**The Four Actions:**

**ELIMINATE: Which factors should be eliminated that the industry takes for granted?**
- Factors that no longer deliver value but add cost
- Features that exist because "we've always had them"
- Complexity that intimidates non-customers
- Requirements that create barriers to entry

**REDUCE: Which factors should be reduced well below the industry standard?**
- Over-designed features (beyond what most users need)
- Over-investment in factors that only serve extreme users
- Quality dimensions where "good enough" is truly good enough
- Cost drivers that don't proportionally increase customer value

**RAISE: Which factors should be raised well above the industry standard?**
- Factors that matter most to non-customers (their barriers)
- Pain points that the entire industry underdelivers on
- Factors where raising creates disproportionate value
- Elements that enable entirely new use cases

**CREATE: Which factors should be created that the industry has never offered?**
- Solutions to problems the industry doesn't recognize
- Value dimensions borrowed from other industries
- Features that serve non-customers specifically
- Entirely new ways to deliver the core value

**The key insight:** Value innovation happens when you simultaneously Eliminate/Reduce (lowering cost) AND Raise/Create (increasing value). This breaks the traditional trade-off between differentiation and low cost.

**Output:** An ERRC grid with specific factors in each quadrant, supported by evidence from Steps 1 and 2.

## Workflow

Follow these steps in sequence:

1. **Start with the Strategy Canvas:** Map the competitive landscape. Identify where the industry has converged and what assumptions everyone shares.

2. **Analyze non-customers:** Identify the three tiers. Understand their barriers, substitutes, and what would convert them. **Ensure global diversity**—non-customers look very different in different markets.

3. **Apply the Four Actions:** Use insights from Steps 1 and 2 to fill the ERRC grid. Challenge every industry assumption.

4. **Synthesize:** Describe the Blue Ocean opportunity. What does the new value curve look like? Who are the primary customers? How is it fundamentally different from existing offerings?

5. **Ready for next phase:** Feed insights into customer-discovery (JTBD + persona), or move directly to solution-definition (Working Backwards + Closed World mapping).

## Complete Examples

**For inspiration and patterns:** Read `references/example-outputs.md` for complete Blue Ocean Discovery sessions:
- Budget hospitality (Accor Formula 1 hotels—eliminating lobbies, restaurants, reception)
- Mobile financial services (serving the unbanked in West Africa)
- Remote collaboration (serving solo entrepreneurs, not just enterprises)
- Solar energy (serving rural households, not just commercial installations)

Each example shows the full flow from Strategy Canvas through Non-Customer Analysis to ERRC grid.

## Output Format

Structure your Blue Ocean Discovery as follows:

```markdown
# Blue Ocean Discovery: [Industry/Product Space]

## Strategy Canvas

**Competitive Factors:**
1. [Factor 1]
2. [Factor 2]
...
[List 8-12 factors]

**Competitor Value Curves:**

| Factor | [Competitor A] | [Competitor B] | [Competitor C] | Industry Avg |
|--------|---------------|---------------|---------------|-------------|
| [Factor 1] | [1-5] | [1-5] | [1-5] | [1-5] |
| [Factor 2] | [1-5] | [1-5] | [1-5] | [1-5] |
...

**Observations:**
- Where curves converge: [Factors where everyone is similar]
- Where curves diverge: [Factors where competitors differ]
- Industry assumptions: [What everyone seems to believe is important]
- Overlooked factors: [What no one is investing in]

---

## Non-Customer Analysis

### Tier 1: Soon-to-be Non-Customers
**Who they are:** [Description]
**What they tolerate:** [Current pain points they endure]
**What they'd leave for:** [Value proposition that would pull them away]
**Substitutes they consider:** [Alternatives they're eyeing]
**Estimated size:** [Rough magnitude]

### Tier 2: Refusing Non-Customers
**Who they are:** [Description]
**Why they refuse:** [Specific dealbreakers]
**What they use instead:** [Substitutes or workarounds]
**What would convert them:** [Changes needed to win them over]
**Estimated size:** [Rough magnitude]

### Tier 3: Unexplored Non-Customers
**Who they are:** [Description]
**Why the industry ignores them:** [Assumptions and blind spots]
**What would make it relevant:** [How to redefine the offering for them]
**What they use instead:** [Often nothing, or very different substitutes]
**Estimated size:** [Rough magnitude]

**Non-Customer Commonalities:**
- Shared barriers across tiers: [What's common]
- Shared unmet needs: [What they all want but can't get]

---

## Four Actions Framework (ERRC Grid)

### ELIMINATE
- [Factor 1]: [Why—evidence from Strategy Canvas / Non-Customer Analysis]
- [Factor 2]: [Why]

### REDUCE
- [Factor 1]: [Why and to what level]
- [Factor 2]: [Why and to what level]

### RAISE
- [Factor 1]: [Why and how much]
- [Factor 2]: [Why and how much]

### CREATE
- [Factor 1]: [Why—what non-customer need this serves]
- [Factor 2]: [Why]

---

## New Value Curve

**Proposed Value Curve vs Industry Average:**

| Factor | Industry Avg | Our Blue Ocean |
|--------|-------------|---------------|
| [Eliminated factor] | [3] | [0] |
| [Reduced factor] | [4] | [2] |
| [Raised factor] | [2] | [5] |
| [Created factor] | [0] | [4] |
...

---

## Blue Ocean Opportunity Summary

**The opportunity:** [2-3 sentence description of the uncontested market space]

**Primary customers:** [Who this serves—including converted non-customers]

**Key differentiator:** [What makes this fundamentally different]

**Cost structure impact:** [How Eliminate/Reduce changes the economics]

**Value creation impact:** [How Raise/Create delivers unprecedented value]

**Implications for solution-definition:**
- [Insight 1 for PRFAQ]
- [Insight 2 for Closed World]
- [Insight 3 for customer persona]
```

## Tips for Success

**Strategy Canvas Tips:**
- Include 8-12 factors, not 3-4. The more factors you map, the richer the insight.
- Don't just map product features. Include factors like "ease of purchase," "brand prestige," "after-sales support," "learning curve."
- Rate factors honestly. If all competitors score similarly on a factor, that's important data—it means the industry has converged.
- Include your current product (if it exists) to see how you compare.

**Non-Customer Tips:**
- **ALWAYS consider globally diverse non-customers.** Non-customers in Nigeria face different barriers than non-customers in Sweden.
- Tier 3 (unexplored) is often the largest opportunity but the hardest to see. Push past obvious segments.
- Talk to non-customers if possible. Their reasons for NOT buying are more revealing than customer satisfaction surveys.
- Don't assume non-customers can't afford the product. Often the barrier is relevance, access, or complexity—not price.

**Four Actions Tips:**
- Eliminating and Reducing feels uncomfortable. Push through—this is where cost advantage comes from.
- Created factors should directly address non-customer barriers identified in Step 2.
- The new value curve should look dramatically different from competitors, not slightly shifted.
- Test your ERRC grid: Does it simultaneously lower cost (Eliminate/Reduce) AND increase value (Raise/Create)? If not, it's not value innovation.

## Common Pitfalls

Avoid these mistakes:
- **Benchmarking, not innovating:** The Strategy Canvas is for seeing the landscape, not for copying the best competitor. The goal is to draw a DIFFERENT curve, not a better one.
- **Ignoring non-customers:** Most innovation efforts focus on making existing customers happier. Blue Ocean asks who ISN'T buying and why.
- **Raising everything:** Value innovation requires trade-offs. If you raise everything, you'll raise costs too. Eliminate and Reduce are essential.
- **Creating without evidence:** New factors should come from non-customer insights, not imagination. What do Tier 1/2/3 non-customers actually need?
- **Western bias in non-customer analysis:** Non-customers in emerging markets face infrastructure, literacy, and cultural barriers that are invisible from a Western perspective.
- **Confusing "low cost" with "cheap":** Eliminating and Reducing doesn't mean making a bad product. It means removing what doesn't create value so you can invest in what does.

## Global Diversity in Non-Customer Analysis

**This is critical:** Non-customers look fundamentally different across markets. The same industry has different non-customer profiles in different regions.

**Example—Personal transportation:**
- **US Tier 2 non-customer:** Chooses public transit because parking is expensive and traffic is stressful
- **Nigeria Tier 2 non-customer:** Can't afford any vehicle; uses shared minibuses that are unreliable and overcrowded
- **India Tier 3 non-customer:** Women in conservative regions who aren't encouraged to drive
- **Japan Tier 1 non-customer:** Has a car but uses it once a month; train is more practical

**Each requires a completely different value proposition.**

When doing non-customer analysis, explicitly consider non-customers in at least 2-3 different market contexts.

## Integration with Other Discovery Skills

**Blue Ocean Discovery + Customer Discovery (JTBD):**
- Blue Ocean identifies WHO to target (non-customers and their tiers)
- JTBD goes deep on WHAT jobs they need done
- Use Blue Ocean first to identify the most promising non-customer segment, then run JTBD analysis specifically for that segment

**Blue Ocean Discovery → Solution Definition:**
- ERRC grid directly informs the PRFAQ (what to emphasize, what to leave out)
- Non-customer profile informs persona creation
- Strategy Canvas informs competitive positioning in the FAQ section

## Next Steps

After completing Blue Ocean Discovery:
1. **Deep dive on target segment:** Use customer-discovery skill (JTBD + persona) focused on your chosen non-customer tier
2. **Solution definition:** Use solution-definition skill (Working Backwards + Closed World) with ERRC insights
3. **Ideation:** Use ideation-scamper or ideation-sit to generate ideas that deliver on Raise/Create factors
4. **Evaluation:** Use idea-evaluation skill to rate ideas against the Blue Ocean strategy

The Blue Ocean Discovery output should fundamentally change what you build and who you build it for. If it doesn't, you may be thinking too incrementally—push the Four Actions harder.
