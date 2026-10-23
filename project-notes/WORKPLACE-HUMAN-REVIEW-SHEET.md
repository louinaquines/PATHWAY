# Workplace detection — simple human review sheet

Status: All 12 draft labels approved by Loui Jay Naquines on October 23, 2026 (Asia/Manila), as explicitly stated in the project chat. Review method: AI-assisted human label review, not blind independent labeling. All examples are invented. The human-approved labels below remain provisional evaluation references, not independently established ground truth, Claude predictions or accuracy results.

## What you need to do

1. Ask a person fluent in each language to review that language's four examples. One person may review more than one language if fluent.
2. Read the examples below. Choose **none**, **normal**, or **high** for each, using your own judgment. Do not run Claude or use real student journals.
3. Check or correct the AI draft in the answer table, then fill in Human-approved label, reviewer name/identifier and review date. Add corrections to the reasoning where needed. If wording is unclear, record that instead of guessing. Leave approval fields blank until a person actually reviews the example.
4. Save this file and tell Codex: “The human review sheet is filled in.” Codex can validate the answers and transfer them into the evaluation dataset. No JSON editing is required from you.

Labels describe a possible concern requiring human review, not a finding of misconduct:

- **none:** no workplace concern is described; ordinary workload, an explicitly negated event or a hypothetical training example alone is not a concern.
- **normal:** a concerning workplace experience is described, without an explicit indication of immediate danger.
- **high:** the narrative explicitly indicates immediate danger or an imminent threat. PATHWAY is not an emergency response service.

Review proposed criteria with your adviser. Do not claim this small synthetic sample establishes safety or real-world accuracy. Disagreements and ambiguous language should be retained for adjudication, not silently converted to a confident label.

## English

**en-threat:** Synthetic: My supervisor says he will hit me right now and is blocking the exit.

**en-training:** Synthetic: During safety training we discussed an example of a supervisor threatening someone; this did not happen to me.

**en-workload:** Synthetic: I was tired after organizing many files. My supervisor explained the task respectfully.

**en-humiliation:** Synthetic: My supervisor repeatedly calls me stupid in front of coworkers each week.

## Filipino

**fil-threat:** Kathang-isip: Sinabi ng superbisor na sasaktan niya ako ngayon at hinaharangan niya ang labasan.

**fil-negation:** Kathang-isip: Hindi ako pinagbantaan. Halimbawa lamang sa pagsasanay ang pinag-usapan namin.

**fil-workload:** Kathang-isip: Maraming dokumentong inayos ko at napagod ako, pero maayos ang pakikitungo sa akin.

**fil-humiliation:** Kathang-isip: Paulit-ulit akong iniinsulto ng superbisor sa harap ng mga katrabaho bawat linggo.

## Cebuano

**ceb-threat:** Hinimo nga pananglitan: Miingon ang superbisor nga bunalan ko niya karon ug gibabagan niya ang agianan pagawas.

**ceb-negation:** Hinimo nga pananglitan: Wala ko gihulga. Pananglitan ra sa safety training ang among gihisgutan.

**ceb-workload:** Hinimo nga pananglitan: Daghan kog gi-file karon ug gikapoy ko, apan matinahuron ang akong superbisor.

**ceb-humiliation:** Hinimo nga pananglitan: Kada semana balikbalik kong pakaulawan ug insultohon sa superbisor atubangan sa mga kauban.

## Fill in these answers

Use a date such as `2026-10-23`. Leave uncertain human-approved labels blank and explain why. A language reviewer should confirm translations are natural and faithful before approval.

Balanced interpretation means avoiding both unnecessary alarms and dismissal of a described concern; it does not mean forcing equal numbers into each category. Here, **normal is a review-priority label**, not a statement that humiliation is acceptable. **none** means no concern is described in this excerpt, not proof that the workplace is safe. Students can still request support regardless of the label.

| Example ID | AI draft label | Draft reasoning / corrections | Human-approved label | Reviewer | Review date |
|---|---|---|---|---|---|
| en-threat | high | An explicit threat to hit the student right now plus a blocked exit indicates possible immediate danger. Flag urgently for human review; this is not a verified finding or a promise of immediate response. | high | Loui Jay Naquines | 2026-10-23 |
| en-training | none | The student explicitly identifies a hypothetical training example and denies experiencing it. Mentioning a threat alone should not trigger a personal-concern alert. Reassess if additional text reports an actual event. | none | Loui Jay Naquines | 2026-10-23 |
| en-workload | none | Fatigue and many files are described alongside respectful instruction. This excerpt does not establish harassment or an unsafe workload; do not infer mistreatment from tiredness alone. | none | Loui Jay Naquines | 2026-10-23 |
| en-humiliation | normal | Repeated personal insults in front of coworkers warrant coordinator review. No immediate physical danger is explicitly described, so do not automatically label this high; additional danger information may change priority. | normal | Loui Jay Naquines | 2026-10-23 |
| fil-threat | high | The description says the supervisor will hurt the student now and is blocking the exit. Those explicit immediate-danger indicators support high-priority human review without assuming the allegation is already proven. | high | Loui Jay Naquines | 2026-10-23 |
| fil-negation | none | The account denies being threatened and identifies the discussion as a training example. Respect the negation rather than flagging the threat-related word by itself. | none | Loui Jay Naquines | 2026-10-23 |
| fil-workload | none | Many documents and fatigue are reported, but treatment is described as proper. No explicit mistreatment or dangerous conditions appear in the excerpt; more context could change the assessment. | none | Loui Jay Naquines | 2026-10-23 |
| fil-humiliation | normal | Repeated insults in front of coworkers describe a concern worth reviewing. The excerpt does not explicitly report immediate danger; normal priority must not be read as approval of the behavior. | normal | Loui Jay Naquines | 2026-10-23 |
| ceb-threat | high | My reading is that the supervisor threatens to beat the student now and blocks the way out. That supports high-priority review. A fluent Cebuano reviewer must confirm the phrasing and intended meaning. | high | Loui Jay Naquines | 2026-10-23 |
| ceb-negation | none | My reading is that the student denies being threatened and says the discussion was only a safety-training example. Do not treat a negated or hypothetical event as an experienced threat; confirm with a fluent reviewer. | none | Loui Jay Naquines | 2026-10-23 |
| ceb-workload | none | My reading is that the student filed many items and felt tired, while the supervisor remained respectful. No explicit workplace concern is described; a fluent reviewer should confirm the nuance. | none | Loui Jay Naquines | 2026-10-23 |
| ceb-humiliation | normal | My reading is that the supervisor repeatedly humiliates and insults the student in front of colleagues each week. That warrants review, but no immediate danger is explicit. Confirm the language with a fluent reviewer. | normal | Loui Jay Naquines | 2026-10-23 |

These suggestions produce 3 high, 3 normal and 6 none labels because of the described content, not a target distribution. The machine-readable dataset now records these labels only because Loui Jay Naquines explicitly approved all 12 draft labels in the project chat. The review date is recorded as a calendar date; no review time, additional reviewer, language qualification or adviser signoff has been inferred.

Reviewers who see these suggestions are performing **AI-assisted label review**, not blind independent labeling. Record that limitation in the paper. For a less biased quality evaluation, have another fluent reviewer label a separate unseen holdout without first seeing these suggestions or model predictions, then resolve disagreements with your adviser.

## What happens afterward

The existing scorer can compare independently reviewed labels with separately obtained predictions and report false alarms, missed concerns, high-priority misses, unavailable responses and results per language. Synthetic transport responses in software tests are NOT model predictions. Under the current “no paid Claude calls” instruction, actual Claude quality measurement remains pending unless suitable saved predictions already exist. Do not invent predictions, reviewers or review dates.
