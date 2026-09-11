# SIT Ideation: Example Outputs

## Example 1: FairCredit (Nigeria Mobile Micro-Lending)

### Closed World Reference
**Internal Components:** Loan algorithm, mobile interface (USSD/SMS), repayment tracking, merchant trust score, transaction history, notification system, loan terms, interest rate, user profile
**External Components:** User's feature phone, mobile money (M-Pesa/OPay), user's daily sales patterns, market associations, local merchants, mobile network, time of day, weather, user's location

---

### VARIABLE DEPENDENCY Ideas

1. **Virtual Product:** Interest rate varies with repayment consistency
   **Variables linked:** Interest rate ↔ repayment streak
   **Type:** Internal-Internal
   **Value discovered:** Rewards good behavior automatically. Borrowers see direct benefit of timely repayment. Reduces default risk while building loyalty.

2. **Virtual Product:** Loan amount available varies with time of day
   **Variables linked:** Maximum loan amount ↔ time of day
   **Type:** Internal-External
   **Value discovered:** Market traders need cash in early morning to buy stock. Higher limits at 5-7 AM match real need. Reduces idle borrowing at other times.

3. **Virtual Product:** Notification frequency varies with user's repayment risk level
   **Variables linked:** SMS reminder frequency ↔ risk score
   **Type:** Internal-Internal
   **Value discovered:** Low-risk borrowers aren't annoyed by unnecessary reminders. High-risk borrowers get gentle nudges. Improves experience for both segments.

4. **Virtual Product:** Loan terms displayed in user's local language, automatically detected from phone settings
   **Variables linked:** Interface language ↔ phone language setting
   **Type:** Internal-External
   **Value discovered:** Yoruba, Igbo, Hausa speakers understand terms better. Reduces confusion and disputes. Builds trust with non-English speakers.

5. **Virtual Product:** Merchant trust score visibility varies with the viewer's relationship to the merchant
   **Variables linked:** Trust score detail level ↔ viewer identity
   **Type:** Internal-External
   **Value discovered:** Merchants see their full score (motivating). Borrowers see a simple badge (trust signal). Regulators see detailed analytics. One data source, multiple views.

---

### SUBTRACTION Ideas

1. **Virtual Product:** Remove the loan application entirely
   **What's removed:** Application/request step
   **How value is preserved:** Pre-approved credit lines based on transaction history. Money is available whenever needed, no asking required.
   **Value discovered:** Eliminates friction and stigma of "applying." Traders just pull from their credit line via USSD. Feels like their own money.

2. **Virtual Product:** Remove the interest rate
   **What's removed:** Interest as a concept
   **How value is preserved:** Revenue comes from merchant transaction fees. Borrowers pay nothing directly—merchants absorb tiny fee on each sale.
   **Value discovered:** "Free loans" is a powerful value proposition. Merchants benefit from increased customer spending.

3. **Virtual Product:** Remove the individual user profile
   **What's removed:** Individual identity/account
   **How value is preserved:** Loans tied to market stall location + phone number. No formal registration, ID, or profile creation needed.
   **Value discovered:** Reaches people without formal ID documents. Radically lowers barrier to entry. Market stall is the identity.

---

### TASK UNIFICATION Ideas

1. **Virtual Product:** Transaction history also serves as a business analytics dashboard
   **Component:** Transaction history
   **Original task:** Track repayments
   **New task assigned:** Show traders their daily/weekly sales trends, best-selling days, seasonal patterns
   **Value discovered:** Traders get free business intelligence. Increases app stickiness. Data they'd never have otherwise.

2. **Virtual Product:** SMS notifications also serve as financial literacy micro-lessons
   **Component:** Notification system
   **Original task:** Send repayment reminders
   **New task assigned:** Include one financial tip per message ("Did you know? Setting aside 10% of daily sales builds emergency savings")
   **Value discovered:** Builds financial capability in the community. Differentiates from competitors. Creates social value beyond lending.

3. **Virtual Product:** Merchant network also serves as a loan guarantee system
   **Component:** Merchant trust network
   **Original task:** Verify borrower credibility
   **New task assigned:** Merchants co-guarantee loans for their regular customers, sharing small default risk in exchange for loyalty
   **Value discovered:** Community-backed lending. Lower default rates. Stronger merchant-customer relationships.

---

## Example 2: SolarSeva (Rural India Home Solar)

### Closed World Reference
**Internal Components:** Solar panels, battery, charge controller, LED lights, mobile charging port, payment system, installation service, monitoring app, maintenance schedule
**External Components:** Sunlight hours, roof type, household size, local electrician, grid availability, monsoon season, user's income cycle, village community, local shop

---

### SUBTRACTION Ideas

1. **Virtual Product:** Remove the battery entirely
   **What's removed:** Battery storage
   **How value is preserved:** Solar power used only during daylight. Evening lighting via low-power LED charged by small supercapacitor (not a battery). Much cheaper system.
   **Value discovered:** Battery is 40% of system cost. Daytime-only solar at 60% lower price reaches families who can't afford full systems. Evening light from supercapacitor covers 2-3 hours.

2. **Virtual Product:** Remove the installation service
   **What's removed:** Professional installation
   **How value is preserved:** Plug-and-play kit designed for self-installation. Video instructions via WhatsApp. Local shop serves as pickup point.
   **Value discovered:** Eliminates installation cost and wait time. Empowers homeowners. Local shops become distribution hubs without needing technical expertise.

---

### MULTIPLICATION Ideas

1. **Virtual Product:** Two solar panels—one fixed (home roof), one portable (takes to field/shop)
   **What's copied:** Solar panel
   **How the copy differs:** Smaller, portable, detachable
   **Value discovered:** Portable panel charges phone at work or powers a light at the shop. Same household subscription, two locations served. Increases daily usage hours.

2. **Virtual Product:** Two payment schedules—harvest cycle and monthly
   **What's copied:** Payment schedule
   **How the copy differs:** One follows monthly rhythm, one follows crop harvest cycle
   **Value discovered:** Farmers can choose payment aligned with income. Monthly for salaried workers, harvest-aligned for farmers. Same product, different payment fit.

---

### DIVISION Ideas

1. **Virtual Product:** Divide the solar system into shared community modules
   **What's divided:** The complete solar system
   **How it's reorganized:** Central panel array on community building roof, individual battery/light units in each home, connected by simple wiring
   **Value discovered:** Community-scale panels are more efficient. Individual homes get personal light/charging. Shared investment, personal benefit. Suits collective village decision-making.

2. **Virtual Product:** Divide maintenance into user-tasks and expert-tasks
   **What's divided:** Maintenance service
   **How it's reorganized:** Users handle daily tasks (panel cleaning via simple instructions). Expert visits only for annual inspection and repairs.
   **Value discovered:** 80% of maintenance is simple cleaning. Expert visits drop from monthly to annual. Lowers ongoing cost dramatically. Users feel ownership.

---

### TASK UNIFICATION Ideas

1. **Virtual Product:** Solar panel also serves as a rain gauge
   **Component:** Solar panel
   **Original task:** Generate electricity from sunlight
   **New task assigned:** Measure rainfall via power output drops (correlated with cloud cover/rain)
   **Value discovered:** Farmers get local weather data for free. Helps plan planting and harvesting. Agricultural value beyond electricity.

2. **Virtual Product:** Mobile charging port also serves as a community hub signal
   **Component:** Mobile charging port
   **Original task:** Charge phones
   **New task assigned:** When a home's charging port is available, a small light outside indicates neighbors can charge here too
   **Value discovered:** Builds community sharing. Home with solar becomes a micro-hub. Social status for the family. Increases word-of-mouth adoption.

---

## Example 3: Unbroken (Sweden Disaster Logistics)

### Closed World Reference
**Internal Components:** Inventory tracker, route optimizer, volunteer management, communication system, resource database, map interface, status updates, priority algorithm
**External Components:** Disaster type, affected area geography, available roads, weather, volunteer availability, government agencies, local organizations, connectivity level, time since disaster

---

### VARIABLE DEPENDENCY Ideas

1. **Virtual Product:** Interface complexity varies with connectivity level
   **Variables linked:** UI detail level ↔ bandwidth available
   **Type:** Internal-External
   **Value discovered:** Full-featured map and dashboard on good connectivity. Simplified text-based interface on low bandwidth. SMS-only mode when internet is down. System degrades gracefully instead of failing.

2. **Virtual Product:** Priority algorithm weights vary with time since disaster
   **Variables linked:** Resource allocation priorities ↔ hours/days since event
   **Type:** Internal-External
   **Value discovered:** First 24 hours: prioritize water, medical, rescue. Days 2-7: shelter, food, sanitation. Week 2+: rebuilding supplies, psychological support. Algorithm automatically shifts focus as disaster phase evolves.

3. **Virtual Product:** Communication channel varies with recipient's role and location
   **Variables linked:** Message delivery method ↔ recipient role + connectivity
   **Type:** Internal-External
   **Value discovered:** Field volunteers get SMS. Coordinators get app notifications. Government liaisons get email reports. Each stakeholder gets information in the format that reaches them most reliably.

---

### SUBTRACTION Ideas

1. **Virtual Product:** Remove the central server entirely
   **What's removed:** Central server/cloud infrastructure
   **How value is preserved:** Fully peer-to-peer system. Each device holds a copy of relevant data. Devices sync when they encounter each other (mesh network style).
   **Value discovered:** Works when all infrastructure is destroyed. No single point of failure. Each volunteer's phone IS the system. True resilience for worst-case scenarios.

---

### TASK UNIFICATION Ideas

1. **Virtual Product:** Volunteer GPS data also serves as road accessibility mapping
   **Component:** Volunteer location tracking
   **Original task:** Know where volunteers are
   **New task assigned:** Movement patterns reveal which roads are passable. If volunteers can reach location X, the route is open.
   **Value discovered:** Real-time road condition map built automatically from volunteer movement. No separate survey needed. Map accuracy improves as more volunteers move through the area.

2. **Virtual Product:** Resource requests also serve as needs assessment data
   **Component:** Supply request system
   **Original task:** Request specific supplies
   **New task assigned:** Aggregate request patterns reveal which areas have which needs, at what intensity, over time
   **Value discovered:** Real-time needs heatmap built from ground-truth data. Helps government and NGOs allocate resources. Each request is both an action and a data point.
