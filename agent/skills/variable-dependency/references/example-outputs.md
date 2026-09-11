# Variable Dependency: Example Outputs

## Example 1: FairCredit (Nigeria Mobile Micro-Lending)

### Variable Inventory

**Internal Variables:**
1. Interest rate (5-25% range)
2. Maximum loan amount (1,000-50,000 NGN)
3. Repayment period (7-90 days)
4. Notification frequency (1-5 per day)
5. Notification content (reminder, tip, alert)
6. Approval speed (instant to 24 hours)
7. Interface language (English, Yoruba, Igbo, Hausa)
8. Credit assessment depth (minimal to comprehensive)
9. Repayment schedule flexibility (fixed vs. flexible)
10. Support channel (SMS, USSD, WhatsApp, call center)

**External Variables:**
1. Time of day
2. User's repayment streak (consecutive on-time payments)
3. User's daily sales pattern (market trader cash flow)
4. Local market day schedule (specific days per region)
5. User's phone type (feature phone vs. smartphone)
6. Mobile network quality at user's location
7. User's business type (food vendor, textile, electronics)
8. Weather (rainy season affects market attendance)
9. User's loan history length (new vs. returning borrower)
10. Number of active borrowers in user's market cluster

### Dependency Matrix Highlights

Most interesting pairs identified:
- Interest rate × repayment streak (reward loyalty)
- Loan amount × time of day (match cash-flow needs)
- Notification content × user's business type (relevance)
- Credit assessment depth × loan amount (proportional risk)
- Support channel × phone type (accessibility)
- Repayment schedule × market day schedule (cultural fit)

### New Dependency Ideas

**Idea 1: Streak Rewards**
**Dependency:** Interest rate decreases as repayment streak increases
**Type:** Internal-External
**Virtual Product:** Every 5 consecutive on-time repayments drop the interest rate by 2 percentage points. One late payment resets the streak. Rate floor of 5%.
**Value Discovered:**
- Self-motivating: borrowers see direct reward for discipline
- Risk automatically matches behavior (reliable borrowers are cheaper)
- Creates a "game" dynamic: borrowers protect their streak
**Who benefits most:** Disciplined repeat borrowers (most profitable segment)
**Feasibility:** High - just a database rule

**Idea 2: Morning Capital**
**Dependency:** Maximum available loan varies with time of day
**Type:** Internal-External
**Virtual Product:** Between 4-7 AM (when market traders buy stock), maximum loan is 1.5x the normal limit. Between 10 PM - 3 AM, maximum drops to 0.5x.
**Value Discovered:**
- Capital is available exactly when traders need it for stock purchases
- Discourages non-productive borrowing during off-hours
- Reduces default risk (money borrowed for stock has clear ROI)
**Who benefits most:** Early-morning market traders buying inventory
**Feasibility:** High - time-based rules on loan limits

**Idea 3: Market Day Alignment**
**Dependency:** Repayment due dates align with local market day schedule
**Type:** Internal-External
**Virtual Product:** Instead of fixed calendar dates, repayment is due on market days (Tuesday/Saturday in one region, Wednesday/Sunday in another). System knows the schedule per region.
**Value Discovered:**
- Payments fall on days when traders have maximum cash
- Default rate drops because system matches real income patterns
- Feels locally aware and culturally appropriate
**Who benefits most:** Market traders in regions with fixed market day schedules
**Feasibility:** Medium - requires mapping market day schedules by region

**Idea 4: Business-Relevant Tips**
**Dependency:** Financial literacy tip content varies with user's business type
**Type:** Internal-External
**Virtual Product:** Food vendors get tips about inventory management and spoilage reduction. Textile traders get tips about seasonal purchasing. Electronics sellers get tips about supplier negotiation.
**Value Discovered:**
- Tips feel personally relevant, not generic
- Higher engagement with notifications (useful, not annoying)
- Builds real business capability in each segment
**Who benefits most:** All borrowers, but especially new business owners
**Feasibility:** Medium - requires business type tagging and content creation per segment

**Idea 5: Progressive Trust**
**Dependency:** Credit assessment depth varies with loan amount requested
**Type:** Internal-Internal
**Virtual Product:** Loans under 5,000 NGN: instant approval, no checks. 5,000-20,000 NGN: basic transaction history check. 20,000-50,000 NGN: merchant endorsement + history. Above 50,000 NGN: full assessment.
**Value Discovered:**
- Tiny loans are frictionless (builds trust and data)
- Risk assessment is proportional to exposure
- New users can start immediately with small amounts
**Who benefits most:** New users (low barrier to entry) and growing businesses (increasing access)
**Feasibility:** High - rule-based assessment tiers

### Broken Dependency Ideas

**Idea B1: Break Loan-Requires-Phone**
**Current dependency:** Loan access depends on having a personal phone
**What if independent:** Loan accessible via shared community phone or merchant's device. Borrower identified by PIN + biometric or market stall number.
**Value Discovered:** Reaches people who share phones or can't afford one. Merchant device becomes a banking terminal. Larger addressable market.

**Idea B2: Break Repayment-Requires-Cash**
**Current dependency:** Repayment requires mobile money or cash
**What if independent:** Repayment possible through goods/services (barter credit). Trader delivers goods to a partner merchant as "payment."
**Value Discovered:** Serves traders in very low-cash-flow periods. Creates merchant network effects. Novel in the micro-lending space.

---

## Example 2: AsyncFlow (Southeast Asia Remote Collaboration)

### Variable Inventory

**Internal Variables:**
1. Notification urgency level (critical, important, FYI)
2. Meeting recording detail level (full, summary, highlights)
3. Interface language
4. Search result depth
5. File sharing permissions
6. Status update frequency
7. Dashboard information density
8. Auto-translation quality tier
9. Feature visibility (full, simplified, minimal)
10. Response time expectation display

**External Variables:**
1. Recipient's focus mode (deep work, available, in meeting)
2. Time zone difference between sender and receiver
3. User's active hours pattern
4. Team size and composition
5. Project deadline proximity
6. User's device type (mobile, tablet, desktop)
7. Connectivity quality
8. Content language being discussed
9. User's seniority/role
10. Number of unread items in queue

### New Dependency Ideas

**Idea 1: Focus-Aware Notifications**
**Dependency:** Notification delivery timing varies with recipient's current focus mode
**Type:** Internal-External
**Virtual Product:** Critical: always delivered immediately. Important: held during deep-work mode, delivered at next break. FYI: batched into daily digest. Focus mode detected via calendar + activity patterns.
**Value Discovered:**
- Deep work isn't interrupted by non-critical messages
- Users trust the system to filter appropriately
- Addresses #1 pain point in distributed teams (constant interruptions)
**Who benefits most:** Individual contributors doing focused work across time zones
**Feasibility:** Medium - requires focus mode detection logic

**Idea 2: Absence-Aware Summaries**
**Dependency:** Meeting recording detail level varies with whether recipient attended
**Type:** Internal-External
**Virtual Product:** If you attended the meeting, you get a brief action-item list. If you were absent, you get a detailed summary with context, decisions, and your specific action items highlighted.
**Value Discovered:**
- Absent team members (common with 6+ hour time zone spread) get richer context
- Present members aren't burdened with verbose notes
- Same meeting, optimized output per person
**Who benefits most:** Teams spanning multiple time zones where not everyone can attend
**Feasibility:** Medium - attendance tracking + variable summary generation

**Idea 3: Deadline Gravity**
**Dependency:** Dashboard information density and alert frequency increase as project deadline approaches
**Type:** Internal-External
**Virtual Product:** 30+ days out: relaxed dashboard, weekly updates. 7-30 days: daily highlights, blockers surfaced. Under 7 days: real-time status, hourly check-ins, bottleneck alerts.
**Value Discovered:**
- System urgency matches real urgency
- Prevents both complacency (far from deadline) and information overload (normal times)
- Teams naturally ramp up attention as deadlines approach
**Who benefits most:** Project managers and team leads managing remote delivery
**Feasibility:** High - deadline dates are already known, just vary display rules

---

## Example 3: SolarSeva (Rural India Home Solar)

### New Dependency Ideas

**Idea 1: Weather-Adjusted Billing**
**Dependency:** Monthly payment amount varies with actual solar energy generated
**Type:** Internal-External
**Virtual Product:** Monsoon months with less sunlight = lower payment. Peak summer months = slightly higher. Payment calculated from panel output data.
**Value Discovered:**
- Customers pay proportional to value received (feels fair)
- Eliminates complaints during low-sun periods
- Aligns cost with actual benefit—a fundamental fairness innovation
**Who benefits most:** All customers, especially those on tight budgets during monsoon
**Feasibility:** High - solar output is already measurable

**Idea 2: Seasonal Maintenance Coach**
**Dependency:** Maintenance guidance content and urgency varies with season
**Type:** Internal-External
**Virtual Product:** Pre-monsoon: urgent "waterproof your connections" guide. Dust season: weekly "clean your panels" reminder. Summer: "check for overheating" alert on extreme heat days.
**Value Discovered:**
- Maintenance advice that matches actual conditions
- Prevents seasonal damage that's currently the #1 support cost
- Feels like a knowledgeable local advisor, not a generic system
**Who benefits most:** Homeowners in regions with extreme seasonal variation
**Feasibility:** High - seasonal rules + weather API data

**Idea 3: Grid-Aware Battery Reserve**
**Dependency:** Battery emergency reserve percentage varies with local grid reliability
**Type:** Internal-External
**Virtual Product:** In villages with frequent grid outages, battery reserves 25% as emergency backup. In areas with reliable grid, reserves only 5%, using more capacity for daily use.
**Value Discovered:**
- Adaptive resilience per location
- Unreliable-grid villages always have emergency light
- Reliable-grid villages get maximum value from battery
- System learns local patterns automatically from outage data
**Who benefits most:** Households in areas with unreliable grid (most rural India)
**Feasibility:** Medium - requires grid reliability monitoring per location

### Broken Dependency Ideas

**Idea B1: Break Solar-Requires-Roof**
**Current dependency:** Solar panels depend on having a suitable roof
**What if independent:** Community solar garden in a shared space. Each household has a "virtual panel" allocation. No individual roof needed.
**Value Discovered:** Serves renters, thatched-roof homes, and multi-story buildings where roof access is limited. Community investment model suits village collectivism.
